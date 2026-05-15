# SpecForge — Phase 1: Architect Agent

> Plain English product spec in. Layered system architecture diagram out.

SpecForge is an agentic engineering tool built around Andrej Karpathy's framing from AI Ascent 2026: the spec is the program, and the engineer's job is increasingly to write *intent* rather than *implementation*.

Phase 1 is the Architect Agent. You describe what you want to build. The agent parses your intent, structures it into layers, picks a concrete tech stack, and returns an interactive flow diagram you can inspect or hand off to the next agent in the chain.

---

## What It Does

Type a plain-English product idea or upload context documents (PDFs, Word docs, PowerPoints, or images). The backend extracts the text—using Gemma Vision for images—and the Architect agent parses your intent to structure it into layers and pick a concrete tech stack. You get back:

- **Diagram view** — interactive SVG flow diagram with numbered data-flow connections across 4–6 architecture layers
- **Cards view** — layer-by-layer breakdown of every component with tech stack badges
- **Animate view** — step-by-step walkthrough of the system's message journey, with visual micro-animations per step
- **Iterative Refinement** — An interactive feedback panel lets you chat with the model to tweak the architecture (e.g., "swap MySQL for PostgreSQL"). The UI renders a precise Git-style **Changelog** showing what components or layers were added, modified, or removed.
- **Persistence & Checkpoints** — Save architectures locally to a SQLite database. Use **Session Checkpoints** to snapshot your progress and instantly jump back to earlier states if a refinement goes wrong, and use **Overwrite** to update existing saves effortlessly.
- **Theming** — Manual Light/Dark mode toggling built directly into the sidebar.

> **Example input:** *"A job portal where recruiters upload JDs and resumes, an AI agent scores and ranks candidates, sends automated interview emails"*
>
> **Output:** 7-step animated architecture — User (msg_input) → API Gateway → LLM extraction → Embedding → Vector Search → Ranking Engine → Response View

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI · Python 3.11 · httpx · SQLAlchemy |
| Database | SQLite (Persistent Saves & History) |
| Document Parsing | pdfplumber · python-docx · python-pptx · Pillow |
| LLM | Gemma 4 31B & Vision (via Ollama API) |
| Frontend | React 18 · Vite |
| Icons | Tabler Icons webfont (CDN) |
| Diagram | Custom React SVG renderer (no external lib) |
| Animation | CSS keyframes + React state machine |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/BhaveshMRA/specforge.git
cd specforge

# 2. Backend setup
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Add your Ollama API key
echo "OLLAMA_API_KEY=your_key_here" > .env

# 4. Start backend
uvicorn main:app --reload
# → http://localhost:8000

# 5. Frontend (new terminal)
cd ../frontend
npm install
npm run dev
# → http://localhost:5173
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
Gemma returns JSON: layers, components, tech choices, connections, key_flows, sample_query
        ↓
React renders 3 interactive views: Diagram / Cards / Animate
        ↓
JSON output feeds Phase 2 (Coder Agent) — coming next
```

The system prompt forces the model to think like a senior architect: concrete tech names, explicit layer-to-layer connections, 4–6 layers, a mandatory `User Experience` entry point, and a complete round-trip flow back to `response_view`.

---

## Animate View — How It Works

The `key_flows` field from the model contains a single concatenated string:

```
"Step 1: User submits query via msg_input → Step 2: api_gateway routes to orchestrator → ..."
```

The frontend parses this on `→ Step N:` boundaries into individual steps. Each step is then:

1. **Classified** by keyword detection (`user submits` → `user_input`, `llm / synthesizes` → `ai_process`, `stream back` → `stream_back`, etc.)
2. **Rendered as a visual scene** — two icon nodes (source → destination) with an animated particle icon traveling between them on a glowing track
3. **Advanced manually** via Next / Finish buttons — the vertical progress line fills and a glowing dot travels down as you step through

| Step type | Scene |
|-----------|-------|
| `user_input` | 👤 User → 📄 sending → 📝 Input |
| `api_route` | 🖥️ API GW → 🔀 routing → 🕸️ Router |
| `auth` | 🔑 Auth → 🔓 token → 🛡️ Secure |
| `ai_process` | 🧠 Context → ✨ thinking → 🤖 LLM |
| `data_fetch` | 🔍 Query → → 🗄️ Store |
| `transform` | 📄 Raw → ⚙️ parsing → 📊 Structured |
| `stream_back` | 🤖 AI → 〰️ streaming → 👤 User |
| `ranking` | 📋 Results → ↓ ranking → 🏆 Top K |

---

## Project Structure

```
specforge/
├── backend/
│   ├── main.py              # FastAPI app, Ollama API proxy, system prompt
│   ├── .env                 # OLLAMA_API_KEY (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Full UI: Diagram, Cards, Animate views + StepScene
│   │   ├── main.jsx         # React entry
│   │   └── index.css        # Design tokens, animations, component styles
│   ├── index.html           # Tabler Icons CDN + Google Fonts
│   ├── package.json
│   └── vite.config.js       # Dev proxy: /api → localhost:8000
├── .gitignore
└── README.md
```

---

## Architecture JSON Schema

```json
{
  "project_name": "CandidateIQ",
  "summary": "AI-powered recruiting platform that screens and ranks candidates automatically.",
  "sample_query": "Upload resume_john_doe.pdf for the Senior Engineer role and rank against pipeline.",
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
          "connects_to": ["api_gateway"]
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
    "Step 1: Recruiter uploads resume via msg_input → Step 2: api_gateway routes to ai_orchestrator → Step 3: llm_engine scores candidate → Step 4: ranked list returned to response_view"
  ]
}
```

---

## Roadmap

This is Phase 1 of a 4-phase agentic engineering system. The output of each phase is the input spec for the next agent.

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
