# SpecForge — Phase 1: Architect Agent

> Plain English product spec in. Layered system architecture diagram out.

SpecForge is an agentic engineering tool built around Andrej Karpathy's framing from AI Ascent 2026: the spec is the program, and the engineer's job is increasingly to write *intent* rather than *implementation*.

Phase 1 is the Architect Agent. You describe what you want to build. The agent parses your intent, structures it into layers, picks a concrete tech stack, and returns an interactive flow diagram (featuring Diagram, Cards, and Animation views) you can inspect or hand off to the next agent in the chain.

---

## Demo

![SpecForge demo](https://via.placeholder.com/740x420/1c1c1a/378ADD?text=SpecForge+Demo)

> Input: *"A job portal where recruiters upload JDs and resumes, an AI agent scores and ranks candidates, sends automated interview emails"*  
> Output: 5-layer architecture — React UI → FastAPI → LangGraph scoring agent → Gemma 4 (31B) → PostgreSQL + ChromaDB

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI · Python 3.11 · httpx |
| LLM | Gemma 4 31B (via Ollama API) |
| Frontend | React 18 · Vite |
| Diagram | Interactive React SVG rendering (Diagram, Cards, and Animate views) |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/BhaveshMRA/specforge.git
cd specforge

# 2. Set up env (for backend)
cd backend
cp .env.example .env
# → add your OLLAMA_API_KEY to .env

# 3. Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# → running at http://localhost:8000

# 4. Frontend (new terminal)
cd ../frontend
npm install
npm run dev
# → open http://localhost:5173
```

---

## How It Works

```
You type a spec in plain English
        ↓
FastAPI receives POST /api/architect
        ↓
Sends spec + structured system prompt to Gemma 4 31B (via Ollama API)
        ↓
Gemma returns JSON: layers, components, tech choices, connections
        ↓
React renders interactive UI (Diagram / Cards / Animation)
        ↓
JSON output feeds Phase 2 (Coder Agent) — coming next
```

The system prompt forces the LLM to think like a senior architect: concrete tech names, explicit layer-to-layer connections, 4–6 layers max. It enforces a strict "User Experience" entry point and complete round-trip flow connections to a "Response Display".

---

## Project Structure

```
specforge/
├── backend/
│   ├── main.py              # FastAPI app, Ollama API proxy, system prompt
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Architect UI + interactive SVG renderer
│   │   ├── main.jsx         # React entry
│   │   └── index.css        # Design tokens + component styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js       # Dev proxy: /api → localhost:8000
├── .gitignore
└── README.md
```

---

## Architecture JSON Schema

The agent returns a structured object that doubles as the spec for Phase 2:

```json
{
  "project_name": "CandidateIQ",
  "summary": "AI-powered recruiting platform that screens and ranks candidates automatically.",
  "layers": [
    {
      "id": "user_experience",
      "name": "User Experience",
      "color": "blue",
      "description": "Recruiter dashboard and file upload",
      "components": [
        {
          "id": "msg_input",
          "name": "Message Input",
          "tech": "Chat UI / Web Form",
          "purpose": "User types and submits here",
          "connects_to": ["fastapi_server"]
        },
        {
          "id": "response_view",
          "name": "Response Display",
          "tech": "Streaming UI",
          "purpose": "User sees output here",
          "connects_to": []
        }
      ]
    }
  ],
  "key_flows": [
    "Step 1: Recruiter uploads JD and resume batch → Step 2: FastAPI parses files → Step 3: LangGraph agent scores each resume against JD criteria → Step 4: ranked list returned to Response Display"
  ]
}
```

---

## Roadmap

This is Phase 1 of a 4-phase agentic engineering system. The idea: the output of each phase is the input spec for the next agent.

| Phase | Agent | What it does | Status |
|-------|-------|--------------|--------|
| **1** | **Architect** | spec → layered architecture diagram | ✅ Done |
| 2 | Coder | architecture JSON → working full-stack code | 🔜 Next |
| 3 | Tester | generated code → automated test suite | 🔜 Planned |
| 4 | Red-Team | deployed app → security probe + vulnerability report | 🔜 Planned |

The end state: you write a plain English spec, four agents in sequence build, test, deploy, and harden the software. No manual coding required.

---

## Why This Matters

Karpathy said it at AI Ascent 2026: the hiring test for agentic engineers isn't puzzle-solving anymore. It's something like — *"write a Twitter clone, make it secure, deploy it, then send 10 agents to break it."*

SpecForge is that pipeline, being built one phase at a time.

---

## Author

**Bhavesh Maurya** — MS Computer Science, Stevens Institute of Technology  
[github.com/BhaveshMRA](https://github.com/BhaveshMRA) · bmaurya@stevens.edu
