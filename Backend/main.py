import os
from dotenv import load_dotenv
import json
from typing import List, Optional, Dict
from uuid import uuid4
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

import models
import schemas
from database import get_db, engine

from graph_setup import memory
from langchain_openai import ChatOpenAI
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph_supervisor import create_supervisor

from Agents.RAG_agent import init_rag_agent, create_rag_agent

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext

import shutil
import io
import riva.client

from Agents.pdf_processor import process_pdf_and_extract_modules

load_dotenv(dotenv_path=".env")

models.Base.metadata.create_all(bind=engine)

SECRET_KEY = os.getenv("SECRET_KEY", "a_super_secret_key_for_dev_please_change_me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


rag_llm = ChatOpenAI(model='gpt-4o', temperature=0)
supervisor_llm = ChatOpenAI(model='gpt-4o', temperature=0)
embedding = NVIDIAEmbeddings(model="nvidia/llama-3.2-nv-embedqa-1b-v2")
ZILLIZ_CLOUD_URI = os.getenv("ZILLIZ_CLOUD_URI")
ZILLIZ_CLOUD_USERNAME = os.getenv("ZILLIZ_CLOUD_USERNAME")
ZILLIZ_CLOUD_PASSWORD = os.getenv("ZILLIZ_CLOUD_PASSWORD")

init_rag_agent(rag_llm, embedding, ZILLIZ_CLOUD_URI, ZILLIZ_CLOUD_USERNAME, ZILLIZ_CLOUD_PASSWORD, None)

rag_agent_obj = create_rag_agent()

# --- FastAPI Application ---
app = FastAPI(
    title="Policy",
    description="A streaming API for the multi-agent financial chatbot with JWT authentication and a persistent database.",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

async def generate_chat_response(message: str, thread_id: str, request: schemas.ChatRequest):
    config = {"configurable": {"thread_id": thread_id}}
    
    # Direct instruction to ensure the agent uses the requested language
    lang_msg = SystemMessage(content=f"You must respond to the user strictly in the following language: {request.language}")
    
    async for event in rag_agent_obj.astream_events(
        {"messages": [lang_msg, HumanMessage(content=message)]}, 
        version="v2", 
        config=config
    ):
        event_type = event["event"]
        data = event["data"]
        payload = {}
        if event_type == "on_tool_start":
            payload = {"type": "tool_start", "content": "Working..."}
        elif event_type == "on_tool_end":
            payload = {"type": "tool_end"}
        elif event_type == "on_chat_model_stream":
            chunk_content = data.get("chunk").content if hasattr(data.get("chunk"), 'content') else ""
            if chunk_content:
                payload = {"type": "content", "content": chunk_content}
        
        if payload:
            yield f"data: {json.dumps(payload)}\n\n"
            
    yield f"data: {json.dumps({'type': 'end'})}\n\n"

@app.post("/signup", response_model=schemas.Token)
async def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    # **NEW**: Generate a unique thread_id for the new user
    thread_id = str(uuid4())
    
    new_user = models.User(
        username = user.username,
        email=user.email, 
        hashed_password=hashed_password,
        thread_id=thread_id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": new_user.email}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/login", response_model=schemas.Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.email}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

# --- Protected Chat Endpoint ---
@app.post("/chat-stream")
async def chat_stream(request: schemas.ChatRequest, current_user: models.User = Depends(get_current_user)):

    thread_id = current_user.thread_id

    return StreamingResponse(
        generate_chat_response(request.message, thread_id, request),
        media_type="text/event-stream"
    )

@app.post("/translate")
async def translate_text(request: Dict[str, str], current_user: models.User = Depends(get_current_user)):
    """ Endpoint to translate text to a target language using LLM """
    text = request.get("text")
    target_lang = request.get("language")
    if not text or not target_lang:
        raise HTTPException(status_code=400, detail="Missing text or language")
    
    if target_lang.lower() == "english":
        return {"translated_text": text}
        
    try:
        translation_prompt = f"Translate the following text to {target_lang}. ONLY return the translation, no explanation:\n\n{text}"
        resp = await supervisor_llm.ainvoke(translation_prompt)
        return {"translated_text": resp.content}
    except Exception as e:
        print(f"Translation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error translating text: {str(e)}")

# --- New Endpoints for PDF & TTS ---

@app.post("/upload-policy")
async def upload_policy(file: UploadFile = File(...), current_user: models.User = Depends(get_current_user)):
    """ Endpoint to upload a policy PDF and extract training modules """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        temp_file_path = f"temp_{file.filename}"
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        modules = process_pdf_and_extract_modules(
            temp_file_path,
            ZILLIZ_CLOUD_URI,
            ZILLIZ_CLOUD_USERNAME,
            ZILLIZ_CLOUD_PASSWORD
        )
        
        os.remove(temp_file_path)
        return {"message": "Policy uploaded and processed successfully", "modules": modules}
    
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.post("/tts")
async def text_to_speech(request: schemas.TTSRequest, current_user: models.User = Depends(get_current_user)):
    """ Endpoint to convert text to speech using Nvidia Riva """
    try:
        server = "grpc.nvcf.nvidia.com:443"
        nvidia_api_key = os.getenv("NVIDIA_API_KEY")
        
        if not nvidia_api_key:
             raise HTTPException(status_code=500, detail="NVIDIA_API_KEY is not set.")

        auth = riva.client.Auth(
            use_ssl=True,
            uri=server,
            metadata_args=[
                ["function-id", "877104f7-e885-42b9-8de8-f6e4c6303969"],
                ["authorization", f"Bearer {nvidia_api_key}"]
            ]
        )
        service = riva.client.SpeechSynthesisService(auth)
        
        # Determine language/voice mapped from our frontend codes
        riva_lang = "en-US"
        riva_voice = "Magpie-Multilingual.EN-US.Pascal"
        
        if request.language_code == 'hi':
            riva_lang = "hi-IN"
            riva_voice = "Magpie-Multilingual.HI-IN.Pascal"
        elif request.language_code == 'es':
            riva_lang = "es-US"
            riva_voice = "Magpie-Multilingual.ES-US.Pascal"
        elif request.language_code == 'fr':
            riva_lang = "fr-FR"
            riva_voice = "Magpie-Multilingual.FR-FR.Pascal"
        elif request.language_code == 'ta':
            riva_lang = "ta-IN"
            riva_voice = "Magpie-Multilingual.EN-US.Pascal"
            
        print(f"Generating Riva Audio for {request.text} in {riva_lang}")
        
        # Synthesize
        resp = service.synthesize(
            request.text, 
            voice_name=riva_voice, 
            language_code=riva_lang, 
            sample_rate_hz=44100
        )
        
        # Create audio stream (Riva returns raw wav framing in resp.audio)
        audio_fp = io.BytesIO()
        nchannels = 1
        sampwidth = 2
        
        import wave
        with wave.open(audio_fp, 'wb') as out_f:
            out_f.setnchannels(nchannels)
            out_f.setsampwidth(sampwidth)
            out_f.setframerate(44100)
            out_f.writeframesraw(resp.audio)
            
        audio_fp.seek(0)
        return StreamingResponse(audio_fp, media_type="audio/wav")
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"TTS Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")

# --- Add this new endpoint to your main.py file ---
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate

@app.post("/generate-quiz", response_model=schemas.QuizGenerationResponse)
async def generate_quiz(request: schemas.QuizGenerationRequest, current_user: models.User = Depends(get_current_user)):
    """ Endpoint to generate a 3-question MCQ quiz based on module content using LLM """
    try:
        parser = JsonOutputParser(pydantic_object=schemas.QuizGenerationResponse)
        
        prompt = PromptTemplate(
            template="You are an expert training assistant. Generate a 3-question multiple-choice quiz based ONLY on the following content.\n"
                     "Provide the output in the language '{language}'.\n"
                     "{format_instructions}\n"
                     "Content: {content}\n",
            input_variables=["language", "content"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
        
        chain = prompt | supervisor_llm | parser
        
        result = await chain.ainvoke({
            "language": request.language, 
            "content": request.module_content
        })
        
        return result
        
    except Exception as e:
        print(f"Quiz Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating quiz: {str(e)}")

@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    """
    Get the current logged-in user's profile information.
    """
    return current_user

@app.put("/users/me", response_model=schemas.User)
async def update_user_profile(
    profile_data: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Update the current logged-in user's profile information.
    
    This endpoint allows a user to update their age, risk tolerance, and
    notification preferences. Fields are optional; only provided fields will be updated.
    """

    update_data = profile_data.model_dump(exclude_unset=True)

    # Iterate over the provided data and update the user model attributes.
    for key, value in update_data.items():
        setattr(current_user, key, value)
    
    # Add the updated user object to the session and commit the transaction.
    db.add(current_user)
    db.commit()
    # Refresh the object to get the latest data from the database.
    db.refresh(current_user)
    
    return current_user

@app.post("/record-progress", response_model=schemas.User)
async def record_progress(
    progress_data: schemas.ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """ Record a module as completed by the underlying user. """
    import json
    try:
        completed = json.loads(current_user.completed_modules)
    except:
        completed = {}
        
    completed[progress_data.module_title] = True
    current_user.completed_modules = json.dumps(completed)
    
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user

@app.get("/")
def read_root():
    return {"status": "Nivara API is running"}