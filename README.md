# SpecForge — Architect + Coder Agents (Phase 1 & 2)

> Plain English product spec in. A working, boot-tested full-stack app out.

SpecForge is an agentic engineering tool built around Andrej Karpathy's framing from AI Ascent 2026: the spec is the program, and the engineer's job is increasingly to write *intent* rather than *implementation*.

Phase 1 is the Architect Agent: you describe what you want to build, it structures your intent into layers, picks a concrete tech stack, and returns an interactive flow diagram. Phase 2 is the Coder Agent: it turns that architecture into a real, runnable full-stack scaffold — validated, boot-tested, and smoke-tested in a headless browser before you ever see it, with a live in-browser preview of the actual running app.

---

## What It Does

Type a plain-English product idea or upload context documents (PDFs, Word docs, PowerPoints, or images). The backend extracts the text—using Gemma Vision for images—and the Architect agent parses your intent to structure it into layers and pick a concrete tech stack. You get back:

- **Diagram view** — interactive SVG flow diagram with numbered data-flow connections across 4–6 architecture layers
- **Cards view** — layer-by-layer breakdown of every component with tech stack badges
- **Animate view** — step-by-step walkthrough of the system's message journey, with visual micro-animations per step
- **Reason Architecture 🧠** — An embedded conversational AI assistant lets you chat about your architecture contextually. Ask it questions (e.g. "Where is the database?") and it will answer conversationally, or issue structural commands (e.g. "Swap MySQL for PostgreSQL") and it will rebuild the JSON. The UI renders a precise Git-style **Changelog** showing what components or layers were added, modified, or removed.
- **Persistence & Checkpoints** — Save architectures locally to a SQLite database. Use **Session Checkpoints** to snapshot your progress and instantly jump back to earlier states if a refinement goes wrong, and use **Overwrite** to update existing saves effortlessly.
- **Theming** — Manual Light/Dark mode toggling built directly into the sidebar.
- **Paste & drag-and-drop images** — every chat input in the app (the spec box, Reason Architecture, and Debug & Fix) accepts an image via Cmd+V paste or drag-and-drop, not just the file picker.

> **Example input:** *"A job portal where recruiters upload JDs and resumes, an AI agent scores and ranks candidates, sends automated interview emails"*
>
> **Output:** 7-step animated architecture — User (msg_input) → API Gateway → LLM extraction → Embedding → Vector Search → Ranking Engine → Response View

---

## Coder Agent (Phase 2)

Once you have an architecture, hit the **Code** tab. The Coder agent turns the architecture JSON into a real full-stack scaffold and runs it through four validation tiers before showing it to you, auto-retrying up to 3 times if something fails:

1. **Syntax validation** — `ast.parse` for Python, `json.loads` for JSON, `node --check` for plain JS
2. **Backend boot-check** — installs dependencies and actually starts every backend service the app defines (Python or Node, and both together for a split gateway + intelligence/worker service) inside a sandboxed Docker container
3. **Live run** — click **Run App** to install + build the real frontend and boot the real backend, both sandboxed in Docker, embedded live in an iframe right inside SpecForge (backend on :8000, frontend on :8001)
4. **Frontend smoke test** — a headless Playwright browser fills every form field, submits, and checks for console errors, uncaught exceptions, or a red-styled error state, catching bugs that pass syntax checks but crash at runtime

Generated UIs use Tailwind (CDN), Google Fonts, and lucide-react icons, decomposed into real component files instead of one giant `App.jsx` — aiming for shipped-product polish, not a form demo. Every project also ships seeded with realistic **ground-truth sample data** (real rows, real sample documents — not lorem ipsum), so it's already a populated, demoable product on first run instead of an empty state, and a real root-level **README.md** generated alongside the code with the actual setup/run commands.

Generated code never touches your host Python/Node install: `pip install`/`python main.py`, `npm install`/`npm run build`, and every generated backend service run inside `python:3.13-slim`/`node:20-slim` containers (or a combined image, built once and cached, when a backend splits Python and Node services across an API gateway and a separate intelligence/worker layer), memory/CPU-capped, with `pip`/`npm` caches persisted in named Docker volumes so repeat runs stay fast, and labeled so orphans from a crashed or reloaded SpecForge process can always be found and removed. Only the static file server for the already-built frontend runs on the host — it just serves files, it doesn't execute generated code. **Requires Docker Desktop running** — boot-check and Run App are skipped with a clear error if it isn't.

Once you have code, you can:
- **Download ZIP** — the whole generated project as a zip file, no setup required.
- **Push to GitHub** — enter a personal access token and `owner/repo`, then **Push to main** or **New branch**. Ships as a single clean commit (built via the Git Data API, not one commit per file) layered on top of whatever's already in the target branch, so it doesn't clobber other files there. The token only lives in memory for that browser tab — never persisted.
- **Debug & Fix 🔧** — a chat, right below the code, that has *actual* control over the sandboxed app: every message drives a real headless browser against it first (console errors, an automated fill-and-submit sweep, a screenshot), and if the app isn't running yet, it boots it itself rather than asking you to click Run App first. Diagnoses root causes from that live evidence — not guesses — and when it proposes a fix, applies it and restarts the app so you see the result immediately in the live preview. Paste or drop a screenshot of a bug directly into the chat and it's sent straight to the model alongside the diagnostics.

> **Known limits:** 3 retry attempts isn't a guarantee — some generations still fail and need a manual **Regenerate**. This is a local single-user tool: one global run at a time, not a per-user registry.

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
| Code validation | `ast` / `node --check` (syntax) · Docker (sandboxed boot-check + live run) · Playwright + headless Chromium (runtime smoke test) |
| Generated app UI | Tailwind CSS (CDN) · lucide-react · Google Fonts |
| Export / publish | `zipfile` (stdlib, ZIP download) · GitHub Git Data API via `httpx` (Push to GitHub) |

---

## Quick Start

```bash
# 0. Install & start Docker Desktop — required for the Coder agent's
#    boot-check and Run App (generated code runs sandboxed in containers)

# 1. Clone
git clone https://github.com/BhaveshMRA/specforge.git
cd specforge

# 2. Backend setup
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium     # needed for the Coder agent's frontend smoke test

# 3. Add your Ollama API key
echo "OLLAMA_API_KEY=your_key_here" > .env

# 4. Start backend (port 8002 — matches the frontend's dev proxy)
uvicorn main:app --reload --port 8002
# → http://localhost:8002

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
JSON output feeds the Coder Agent (Phase 2) to generate real code
```

The system prompt forces the model to think like a senior architect: concrete tech names, explicit layer-to-layer connections, 4–6 layers, a mandatory `User Experience` entry point, and a complete round-trip flow back to `response_view`.

---

## Coder Agent — How It Works

```
Architecture JSON → POST /api/code
        ↓
Gemma generates a full-stack scaffold (backend + frontend files + README.md)
        ↓
Tier 1: syntax-validate every file
        ↓
Tier 2: install deps, boot every backend service for real (in Docker)
        ↓
Tier 4: headless Playwright fills the UI, submits, checks for errors
        ↓
Any failure → the specific error is fed back to Gemma → retry (max 3x)
        ↓
Files + validation results returned to the UI
        ↓
Click "Run App" (Tier 3) → backend + built frontend run live, embedded in an iframe
        ↓
Debug & Fix chat → drives a real browser against the live app, diagnoses from
that evidence, applies a fix, restarts the app automatically
```

Backend and frontend always run on fixed ports (8000 / 8001) so the generated frontend's hardcoded API calls just work — only one live run at a time, and starting a new one stops whatever's running first. If the architecture calls for more than one backend service (e.g. an API gateway plus a separate intelligence/worker layer), each additional service lives in its own `backend/<name>/` subdirectory and gets the next port up (8001, 8002, ...) — all of them start together in the sandbox and reach each other over `localhost`, so gateway → internal-service calls actually work.

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
│   ├── main.py              # FastAPI app: Architect + Coder agents, code validation/run pipeline
│   ├── test_*.py            # Manual smoke-test scripts (no framework) for the validation pipeline
│   ├── .env                 # OLLAMA_API_KEY (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Full UI: Diagram, Cards, Animate, Code views + StepScene + live run
│   │   ├── main.jsx         # React entry
│   │   └── index.css        # Design tokens, animations, component styles
│   ├── index.html           # Tabler Icons CDN + Google Fonts
│   ├── package.json
│   └── vite.config.js       # Dev proxy: /api → localhost:8002
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

This is a 4-phase agentic engineering system. The output of each phase is the input spec for the next agent.

| Phase | Agent | What it does | Status |
|-------|-------|--------------|--------|
| **1** | **Architect** | spec → layered architecture diagram | ✅ Done |
| **2** | **Coder** | architecture JSON → validated, boot-tested, live-runnable full-stack code | ✅ Done |
| 3 | Tester | generated code → automated test suite | 🔜 Next |
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
