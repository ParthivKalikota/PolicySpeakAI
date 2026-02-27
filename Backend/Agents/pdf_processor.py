import os
import re
from typing import List, Dict, Any
from pydantic import BaseModel
import pymupdf4llm

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownHeaderTextSplitter
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
from langchain_milvus import Milvus
from langchain_core.documents import Document

class Topic(BaseModel):
    heading: str
    content: str

def is_dynamic_heading(line: str) -> bool:
    line = line.strip()

    if not line:
        return False

    # Skip lines with page numbers like "Microsoft Corporation 1 |"
    if "|" in line and len(line.split()) > 3:
        return False

    # Skip numeric subheadings (1., 2., 10.)
    if re.match(r"^\d+(\.|:)", line):
        return False

    # Skip lines that look like sentences
    if line.endswith("."):
        return False
    
    words = line.split()
    if len(words) > 12:
        return False

    # RULE 1: ALL CAPS headings (e.g., "ETHICS AND BUSINESS CONDUCT")
    if line.isupper() and len(words) <= 10:
        return True

    # RULE 2: Title Case headings (multiple capitalized words)
    cap_words = sum(1 for w in words if w[:1].isupper())

    # Must be mostly capitalized, short, not long text
    if len(words) <= 10 and cap_words / len(words) >= 0.6:
        return True

    # RULE 3: Multi-word headings with separators like ";", "-"
    if any(x in line for x in [";", "-", "—"]) and len(words) <= 12:
        return True

    return False

def split_topics_dynamic(chunks) -> List[Topic]:
    topics = []
    current_heading = None
    current_content = ""

    for chunk in chunks:
        for line in chunk.page_content.split("\n"):
            stripped = line.strip()

            # Detect heading dynamically
            if is_dynamic_heading(stripped):
                # Save previous topic
                if current_heading and current_content.strip():
                    topics.append(Topic(
                        heading=current_heading,
                        content=current_content.strip()
                    ))

                # New topic starts
                current_heading = stripped
                current_content = ""
            else:
                # Add normal lines
                if stripped:
                    current_content += stripped + "\n"

    # Add last topic
    if current_heading and current_content.strip():
        topics.append(Topic(
            heading=current_heading,
            content=current_content.strip()
        ))

    return topics

def process_pdf_and_extract_modules(pdf_path: str, zilliz_uri: str, zilliz_user: str, zilliz_pass: str) -> List[Dict[str, str]]:
    """
    Parses a PDF into exact Markdown format, creates chunks based on exact markdown headings, 
    embeds them into Milvus, and returns the topics as perfect subtopics.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found at {pdf_path}")
        
    print(f"Extracting markdown perfectly from {pdf_path}...")
    md_text = pymupdf4llm.to_markdown(pdf_path)
    
    # Custom robust Markdown splitter using regex
    # We will split on any lines that start with #, ##, ###, or **Heading**
    import re
    
    # Matches markdown headers like # Heading, ## Subheading, or **Bold Heading**
    pattern = re.compile(r'^(#{1,4}\s+.*|\*\*[A-Z].*\*\*)$', re.MULTILINE)
    
    # Find all header matches and their positions
    matches = list(pattern.finditer(md_text))
    
    topics_map = {}
    
    if not matches:
        # If no headers found at all, fallback to chunking
        topics_map["General Policy Info"] = md_text
    else:
        # Extract content between headers
        for i, match in enumerate(matches):
            header_text = match.group(1).strip('#').strip('*').strip()
            start_pos = match.end()
            end_pos = matches[i+1].start() if i + 1 < len(matches) else len(md_text)
            
            # Remove markdown asterisks from the plain text so it displays and speaks cleanly
            content = md_text[start_pos:end_pos].strip()
            content = content.replace('*', '')
            
            if len(content) > 50:
                if header_text in topics_map:
                     topics_map[header_text] += "\n\n" + content
                else:
                     topics_map[header_text] = content
                     
        # Add any intro text before the first header
        intro = md_text[:matches[0].start()].strip()
        if len(intro) > 50:
             topics_map["Introduction"] = intro

    topics = [Topic(heading=k, content=v) for k, v in topics_map.items()]
    
    # We still chunk the raw text for Milvus embedding logic, but Topics are exact
    char_splitter = RecursiveCharacterTextSplitter(
        chunk_size=2000,
        chunk_overlap=250
    )
    
    # Convert topics back into Documents for Milvus
    topic_docs = [Document(page_content=f"{t.heading}\n\n{t.content}", metadata={"source": pdf_path, "header": t.heading}) for t in topics]
    chunks = char_splitter.split_documents(topic_docs)
    
    # Store in Milvus VectorDB
    embeddings = NVIDIAEmbeddings(model="nvidia/llama-3.2-nv-embedqa-1b-v2")
    
    Milvus.from_documents(
        chunks,
        embeddings,
        connection_args={
            "uri": zilliz_uri,
            "user": zilliz_user,
            "password": zilliz_pass,
            "secure": True,
        },
        collection_name="LangChainCollection",
        drop_old=False # Append by default
    )
    
    # Return formatted modules for the frontend
    return [{"id": i, "title": t.heading, "summary": t.content} for i, t in enumerate(topics)]
