from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv()

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


class SpecRequest(BaseModel):
    spec: str


@app.get("/health")
async def health():
    return {"status": "ok", "key_set": bool(OLLAMA_API_KEY)}


@app.post("/api/architect")
async def architect(req: SpecRequest):
    if not OLLAMA_API_KEY:
        raise HTTPException(status_code=500, detail="OLLAMA_API_KEY not set in .env")

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.post(
            "https://ollama.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OLLAMA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gemma4:31b",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Architect this: {req.spec}"},
                ],
                "temperature": 0.3,
            },
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Ollama API error: {response.text}",
        )

    data = response.json()
    raw = data["choices"][0]["message"]["content"]
    cleaned = raw.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON: {e}")
