from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import json
import os
import io
import base64
from dotenv import load_dotenv

# ── Database ──────────────────────────────────────────────────────────────────
from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from uuid import uuid4

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./specforge.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class SavedArch(Base):
    __tablename__ = "saved_archs"
    id           = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name         = Column(String, nullable=False)
    project_name = Column(String)
    created_at   = Column(DateTime, default=datetime.utcnow)
    arch_json    = Column(Text, nullable=False)


Base.metadata.create_all(bind=engine)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="SpecForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY")

SYSTEM_PROMPT = """You are a senior software architect. When given even a vague or one-line product idea, you deeply reason about what a complete, production-ready version needs — including the full user journey from input to output.

CRITICAL RULES:
1. The FIRST layer must ALWAYS be "User Experience" (color: blue) with two components:
   - id: "msg_input", name: "Message Input", tech matching the actual UI (e.g. "Resume Upload Form" for ATS, "Chat UI" for chatbot), purpose: "User submits here"
   - id: "response_view", name: "Response Display", tech: "Streaming UI", purpose: "User sees output here"
   msg_input connects_to the first backend component. response_view connects_to nothing.

2. The LAST processing layer must have at least one component whose connects_to includes "response_view".

3. sample_query: generate a REALISTIC example of what a real user would actually input to THIS specific product. NOT a generic chatbot message. For an ATS: "Upload John Smith resume for Senior Engineer role". For a chatbot: "Explain transformer attention in simple terms". For a research tool: "Find recent papers on RAG evaluation". Match the domain exactly.

4. Number every key_flow step: "Step 1: User submits X → Step 2: ..." showing the complete round trip.

Return ONLY valid JSON:
{"project_name":"string","summary":"2-3 sentences","sample_query":"realistic user input for THIS specific product","layers":[{"id":"snake_case","name":"Layer Name","color":"blue|purple|teal|amber|coral|green|gray","description":"max 8 words","components":[{"id":"snake_case","name":"Component Name","tech":"specific tech","purpose":"max 6 words","connects_to":["exact_ids"]}]}],"key_flows":["Step 1: ... → Step 2: ... full round trip"]}

Rules: 4-6 layers. 1-4 components per layer. Specific tech only. Colors: blue=frontend/UI, green=API/backend, purple=agent/AI logic, amber=LLM/model services, teal=data/storage, coral=auth, gray=infra."""

REFINE_PROMPT = """You are a senior software architect conducting a design review. You will receive an existing architecture JSON and a set of requested changes from the engineer.

Your job:
1. Preserve the existing architecture structure as much as possible
2. Apply ONLY the requested changes — add layers, modify components, update connections, etc.
3. Return the complete updated architecture in the exact same JSON schema
4. Update key_flows and sample_query to reflect the changes
5. Keep the same project_name unless the change fundamentally changes the product

Return ONLY valid JSON in the same schema as the input. No explanation, no markdown."""

REASON_PROMPT = """You are a senior software architect conducting a design review. 
You will receive an existing architecture JSON, a chat history, and a prompt from the engineer.

Determine if the engineer is asking a QUESTION (e.g. "where is the database?", "what parameters are there?") or explicitly commanding a STRUCTURAL MODIFICATION (e.g. "add a cache layer", "swap MySQL for PostgreSQL", "add those to the input component").

CRITICAL RULE: Default to "chat" type UNLESS the engineer uses explicit imperative action words instructing you to modify the architecture (e.g., "add", "change", "remove", "update"). If the engineer is just making a statement, providing context, listing items, or asking a question, you MUST use "chat" type.

Return ONLY valid JSON in this exact schema:
{
  "type": "chat" | "architecture",
  "message": "Conversational, helpful response if type is 'chat', otherwise an empty string",
  "architecture": { /* the fully updated architecture JSON if type is 'architecture', otherwise null */ }
}

If the type is 'architecture', you must preserve the existing architecture structure as much as possible, applying ONLY the requested changes, and updating key_flows/sample_query appropriately. Do not output markdown, just the raw JSON object."""


# ── Pydantic models ───────────────────────────────────────────────────────────

class SpecRequest(BaseModel):
    spec: str


class RefineRequest(BaseModel):
    existing_arch: dict
    feedback: str
    chat_history: list = []


class SaveRequest(BaseModel):
    name: str
    arch: dict


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def call_ollama(messages: list) -> dict:
    if not OLLAMA_API_KEY:
        raise HTTPException(status_code=500, detail="OLLAMA_API_KEY not set in .env")
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.post(
            "https://ollama.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OLLAMA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": "gemma4:31b", "messages": messages, "temperature": 0.3},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code,
                            detail=f"Ollama API error: {response.text}")
    raw = response.json()["choices"][0]["message"]["content"]
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON: {e}")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "key_set": bool(OLLAMA_API_KEY)}


@app.post("/api/architect")
async def architect(req: SpecRequest):
    return await call_ollama([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Architect this: {req.spec}"},
    ])


@app.post("/api/refine")
async def refine(req: RefineRequest):
    return await call_ollama([
        {"role": "system", "content": REFINE_PROMPT},
        {"role": "user", "content": (
            f"Existing architecture:\n{json.dumps(req.existing_arch, indent=2)}\n\n"
            f"Requested changes: {req.feedback}"
        )},
    ])


@app.post("/api/reason")
async def reason(req: RefineRequest):
    history_str = ""
    if req.chat_history:
        history_str = "Chat History:\n" + "\n".join([f"{msg['role']}: {msg['message']}" for msg in req.chat_history]) + "\n\n"
        
    return await call_ollama([
        {"role": "system", "content": REASON_PROMPT},
        {"role": "user", "content": (
            f"Existing architecture:\n{json.dumps(req.existing_arch, indent=2)}\n\n"
            f"{history_str}"
            f"Engineer's prompt: {req.feedback}"
        )},
    ])


# ── File extraction helpers ───────────────────────────────────────────────────

def extract_pdf(content: bytes) -> str:
    import pdfplumber
    text_parts = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t.strip())
    return "\n\n".join(text_parts) or "[PDF had no extractable text]"


def extract_docx(content: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(content))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs) or "[Document had no extractable text]"


def extract_pptx(content: bytes) -> str:
    from pptx import Presentation
    prs = Presentation(io.BytesIO(content))
    slides = []
    for i, slide in enumerate(prs.slides, 1):
        texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text.strip())
        if texts:
            slides.append(f"[Slide {i}]\n" + "\n".join(texts))
    return "\n\n".join(slides) or "[Presentation had no extractable text]"


def extract_image_text(content: bytes, mime: str) -> str:
    """Send image to Gemma vision to describe/extract content."""
    b64 = base64.b64encode(content).decode()
    return f"data:{mime};base64,{b64}"  # returned to caller to embed in vision message


# ── Upload endpoint ────────────────────────────────────────────────────────────

ALLOWED_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: PDF, DOCX, PPTX, PNG, JPG, WEBP"
        )

    content = await file.read()

    if ext == ".pdf":
        extracted = extract_pdf(content)
    elif ext == ".docx":
        extracted = extract_docx(content)
    elif ext == ".pptx":
        extracted = extract_pptx(content)
    elif ext in IMAGE_EXTS:
        # For images: send to Gemma vision to extract/describe content
        if not OLLAMA_API_KEY:
            raise HTTPException(status_code=500, detail="OLLAMA_API_KEY not set")
        b64 = base64.b64encode(content).decode()
        data_url = f"data:{ALLOWED_TYPES[ext]};base64,{b64}"
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.post(
                "https://ollama.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OLLAMA_API_KEY}",
                         "Content-Type": "application/json"},
                json={
                    "model": "gemma4:31b",
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url}},
                            {"type": "text", "text": (
                                "Extract and describe all text, diagrams, and relevant content "
                                "from this image. Be thorough — this will be used as context "
                                "for a software architecture tool."
                            )},
                        ],
                    }],
                    "temperature": 0.1,
                },
            )
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Vision extraction failed: {r.text}")
        extracted = r.json()["choices"][0]["message"]["content"]
    else:
        extracted = "[File type not supported for extraction]"

    char_count = len(extracted)
    return {
        "filename": file.filename,
        "extracted_text": extracted,
        "char_count": char_count,
    }


# ── Save endpoints ─────────────────────────────────────────────────────────────

from fastapi import Depends
from sqlalchemy.orm import Session


@app.post("/api/saves", status_code=201)
def create_save(req: SaveRequest, db: Session = Depends(get_db)):
    save = SavedArch(
        id=str(uuid4()),
        name=req.name,
        project_name=req.arch.get("project_name"),
        arch_json=json.dumps(req.arch),
    )
    db.add(save)
    db.commit()
    db.refresh(save)
    return {"id": save.id, "name": save.name, "project_name": save.project_name,
            "created_at": save.created_at.isoformat()}


@app.get("/api/saves")
def list_saves(db: Session = Depends(get_db)):
    saves = db.query(SavedArch).order_by(SavedArch.created_at.desc()).all()
    return [{"id": s.id, "name": s.name, "project_name": s.project_name,
             "created_at": s.created_at.isoformat()} for s in saves]


@app.get("/api/saves/{save_id}")
def get_save(save_id: str, db: Session = Depends(get_db)):
    save = db.query(SavedArch).filter(SavedArch.id == save_id).first()
    if not save:
        raise HTTPException(status_code=404, detail="Save not found")
    return {"id": save.id, "name": save.name, "arch": json.loads(save.arch_json),
            "created_at": save.created_at.isoformat()}


@app.put("/api/saves/{save_id}")
def update_save(save_id: str, req: SaveRequest, db: Session = Depends(get_db)):
    save = db.query(SavedArch).filter(SavedArch.id == save_id).first()
    if not save:
        raise HTTPException(status_code=404, detail="Save not found")
    
    save.project_name = req.arch.get("project_name")
    save.arch_json = json.dumps(req.arch)
    db.commit()
    db.refresh(save)
    return {"id": save.id, "name": save.name, "project_name": save.project_name,
            "created_at": save.created_at.isoformat()}


@app.delete("/api/saves/{save_id}", status_code=204)
def delete_save(save_id: str, db: Session = Depends(get_db)):
    save = db.query(SavedArch).filter(SavedArch.id == save_id).first()
    if not save:
        raise HTTPException(status_code=404, detail="Save not found")
    db.delete(save)
    db.commit()

