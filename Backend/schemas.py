from pydantic import BaseModel
from typing import Optional, Any, Dict, List

class UserProfileUpdate(BaseModel):
    age: Optional[int] = None
    risk_tolerance: Optional[str] = None
    notification_preference: Optional[str] = None

class UserCreate(BaseModel):
    """Schema for creating a new user."""
    username: str
    email: str
    password: str

class UserProfileUpdate(BaseModel):
    """Schema for updating a user's financial profile."""
    # All fields are optional so the user can update one at a time.
    age: Optional[int] = None
    risk_tolerance: Optional[str] = None
    notification_preference: Optional[str] = None

class User(BaseModel):
    """Schema for returning user data to the client."""
    id: int
    username: str
    email: str
    thread_id: str
    
    # Include the profile fields, which can be None if not set
    age: Optional[int] = None
    risk_tolerance: Optional[str] = None
    notification_preference: Optional[str] = None
    completed_modules: str = '{}'

    class Config:
        # Pydantic v1: orm_mode = True
        # Pydantic v2: from_attributes = True
        from_attributes = True

class ProgressUpdateRequest(BaseModel):
    module_title: str

# --- Token Schema ---

class Token(BaseModel):
    """Schema for the authentication token."""
    access_token: str
    token_type: str

# --- Chat Schemas ---

class ChatRequest(BaseModel):
    """Schema for an incoming chat message."""
    message: str
    language: str = "english" # Default to English if not provided

class TTSRequest(BaseModel):
    """Schema for Text-to-Speech requests."""
    text: str
    language_code: str = "en" # gTTS uses 2-letter codes

class InvestmentPlanSchema(BaseModel):
    """Nested schema for a structured investment plan."""
    equity_pct: float
    gold_pct: float
    debt_pct: float
    rationale: str
    market_context: Dict[str, Any] # To hold data from MarketAgent

class QuizGenerationRequest(BaseModel):
    """Schema for requesting a quiz."""
    module_content: str
    language: str = "english"

class QuizQuestion(BaseModel):
    """Schema for a single quiz question."""
    question: str
    options: List[str]
    answer: str

class QuizGenerationResponse(BaseModel):
    """Schema for the generated quiz response."""
    questions: List[QuizQuestion]

class ChatResponse(BaseModel):
    """
    Schema for a structured chat response.
    This allows the frontend to handle different message types.
    """
    response_type: str  # e.g., "text", "investment_plan", "error"
    content: Any        # Can be a string, or a nested Pydantic model