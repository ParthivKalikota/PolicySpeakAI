from langchain_milvus import Milvus
from langchain_core.prompts import PromptTemplate
from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_core.output_parsers import StrOutputParser

_RAG_llm = None
_embedding = None
_ZILLIZ_CLOUD_URI = None
_ZILLIZ_CLOUD_USERNAME = None
_ZILLIZ_CLOUD_PASSWORD = None
_ZILLIZ_CLOUD_API_KEY = None
_rag_agent_prompt = None
vector_store = None
_parser = None

def init_rag_agent(rag_llm, embedding, ZILLIZ_CLOUD_URI, ZILLIZ_CLOUD_USERNAME, ZILLIZ_CLOUD_PASSWORD, ZILLIZ_CLOUD_API_KEY):
    global _RAG_llm, _embedding, _ZILLIZ_CLOUD_URI, _ZILLIZ_CLOUD_USERNAME, _ZILLIZ_CLOUD_PASSWORD, _ZILLIZ_CLOUD_API_KEY, _rag_agent_prompt, vector_store, _parser
    _RAG_llm = rag_llm
    _embedding = embedding
    _ZILLIZ_CLOUD_URI = ZILLIZ_CLOUD_URI
    _ZILLIZ_CLOUD_USERNAME = ZILLIZ_CLOUD_USERNAME
    _ZILLIZ_CLOUD_PASSWORD = ZILLIZ_CLOUD_PASSWORD
    _ZILLIZ_CLOUD_API_KEY = ZILLIZ_CLOUD_API_KEY
    _rag_agent_prompt = PromptTemplate.from_template("""
        You are RAG_agent, an AI assistant specialized in answering questions in the requested language.
        You are powered by a Retrieval-Augmented Generation (RAG) system that uses a Milvus/Zilliz Cloud vector database.

        The user is asking a question and specifically wants the answer in the following language: {language}.
        If the language is 'english', reply normally.

        Your role:
        1. Retrieve semantically similar document excerpts from the knowledge base using the `retriever_tool`.
        - This knowledge base contains financial guides, investment strategies, regulations, policies, FAQs, and domain-specific resources.
        2. Use ONLY the retrieved document excerpts to construct your answers.
        3. If the retrieved context does not provide enough information, explicitly respond with:
        "The provided document excerpts do not contain sufficient information to answer this question."

        Behavior rules:
        - Do NOT use external knowledge, personal opinions, or assumptions.
        - Do NOT generate content beyond what is present in the retrieved context.
        - Keep answers concise, factual, and strictly grounded in the retrieved text.
        - ALWAYS respond in the language specified ({language}). Do not simply translate the "insufficient information" phrase if you have real context, but if you don't, translate that phrase into {language}.
        """)

    vector_store = Milvus(
        embedding_function=embedding,
        connection_args={
            "uri": ZILLIZ_CLOUD_URI,
            "user": ZILLIZ_CLOUD_USERNAME,
            "password": ZILLIZ_CLOUD_PASSWORD,
            "secure": True,
            "collection_name" : "LangChainCollection"
        },
    )
    _parser = StrOutputParser()

@tool
def retrieve_financial_documents(question: str) -> str:
    """
    Tool to retrieve semantically similar document excerpts from the Finance knowledge base.
    Returns the concatenated text of the retrieved documents.
    """
    print("--- RETRIEVING DOCUMENTS ---")
    if vector_store is None:
        return "Vector store is not initialized."

    retriever = vector_store.as_retriever()

    retrieved_docs = retriever.invoke(question)

    if not retrieved_docs:
        return "No relevant documents were found to answer this question."
        
    context_text = "\n\n---\n\n".join([doc.page_content for doc in retrieved_docs])
    return context_text


def create_rag_agent():
    RAG_agent = create_react_agent(
        model = _RAG_llm,
        tools = [retrieve_financial_documents],
        prompt = "You are a helpful assistant specialized in financial policy analysis. Please follow the language instructions provided in the system message.",
        name = 'RAG_agent'
    )
    return RAG_agent