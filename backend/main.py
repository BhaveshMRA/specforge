from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import urllib.request
import urllib.error
import json
import os
import io
import base64
import re
import ast
import shutil
import subprocess
import tempfile
import sys
import socket
import time
import atexit
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
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8002",
    ],
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

CODER_PROMPT = """You are a senior full-stack engineer. You receive a system architecture JSON (layers, components, tech choices, connections) produced by an Architect agent, and you generate a minimal, runnable scaffold that implements it.

CRITICAL RULES:
1. Map each component's "tech" field to a real, working implementation — no placeholders, no TODOs, no lorem ipsum.
2. Keep it lean on the backend: one clear entry point (e.g. backend/main.py), plus only the extra files strictly needed (models, one route file). On the frontend, decompose into real components instead of one giant App.jsx — separate files for the header, each form, each panel/dashboard section, and reusable pieces (e.g. a Card, a StatBadge) if the UI has repeated visual patterns. 10-20 files total is normal for a UI with more than one screen section.
3. Prefer boring, standard choices consistent with the component's stated tech (e.g. "PostgreSQL" -> SQLAlchemy models + schema; "React" -> a working App.jsx that calls the backend). If a tech name is vague, pick the most common concrete implementation.
4. Code must actually run together: consistent imports, matching route paths between frontend fetch calls and backend routes, a requirements.txt / package.json listing exactly the dependencies used.
5. Include run_instructions: the exact shell commands to install and start it.
6. Backend must be directly runnable with no extra flags. If Python: backend/main.py ending with `if __name__ == "__main__": import uvicorn; uvicorn.run(app, host="0.0.0.0", port=8000)` — do not rely on a separate `uvicorn` command. If Node: backend/main.js listening on port 8000 when run via `node main.js` — do not rely on nodemon/ts-node or a separate dev command. CORS must allow all origins either way.
7. If the frontend is React, it MUST be a Vite app, not Create React App: package.json scripts are exactly {"dev":"vite","build":"vite build"}, deps include "vite" and "@vitejs/plugin-react" as devDependencies, entry point is frontend/index.html at the project root (not frontend/public/index.html) loading frontend/src/main.jsx, and `npm run build` outputs to frontend/dist. All backend calls from the frontend must use the full URL http://localhost:8000/... (no relative paths, no proxy).
8. UI must look like a real shipped product, not a prototype — aim for the visual bar of a funded SaaS product's dashboard, not a form demo. Load Tailwind via `<script src="https://cdn.tailwindcss.com"></script>` in frontend/index.html and style every component with Tailwind utility classes — no unstyled default form elements, no bare black-on-white HTML. Also load a real typeface: `<link>` Google Fonts (e.g. Inter or a domain-appropriate pairing) in index.html and set it as the base font, don't leave it on the browser default. Use: a real color palette (not default blue links), card layouts with borders/shadows/rounded corners, consistent spacing, proper typography hierarchy, hover/focus/disabled states with smooth `transition` on every interactive element, a loading state while a request is in flight, an empty state when a list has zero items, and inline error messages on failure (not alert()). If React: use "lucide-react" for icons (add it as a dependency) instead of emoji or raw SVG — real icons read as more finished. If the domain has summarizable numbers (totals, counts, balances), show them as a row of stat cards at the top of the page, not buried in a list.
9. Never emit LaTeX or math markup ($...$, \\rightarrow, \\times, etc.) anywhere in UI-facing text — browsers don't render it and it shows up as literal garbage. Use plain Unicode symbols instead (→, ×, ±) or plain words.
10. Match the completeness of the architecture, not the minimum to compile: real client-side form validation with visible error messages, handle the actual edge cases implied by the domain (e.g. empty inputs, zero/negative amounts, duplicate names, division remainders when splitting), and give every list/table a populated, realistic empty state — not just a console.log and a TODO.
11. When building a request body object, never use bare object-shorthand for a computed/renamed value (e.g. `{ ...data, split_with }` when the variable is actually named `splitWith`) — that's an undefined-variable crash. Always write the key explicitly: `{ ...data, split_with: splitWith }`. Error-state UI elements must use Tailwind's red palette (text-red-*, bg-red-*, or border-red-*) and only for genuine errors, never for other purposes.
12. Imports are per-file, not global: when the frontend is split into multiple component files, every icon, hook, or helper a file's JSX actually references MUST be imported at the top of that exact file — importing it in App.jsx does not make it available in components/Whatever.jsx. Before finishing each component file, re-check every JSX tag and function call in it against that file's own import list.
13. In backend/requirements.txt, never pin an exact version (==) for a Python package that has a compiled/Rust extension (pydantic, fastapi, uvicorn, sqlalchemy, pillow, cryptography, numpy, etc.) — an old exact pin may have no prebuilt wheel for whatever Python version actually runs it, forcing a from-source compile that fails. List these bare (no version) or with a minimum floor (>=), never ==, so pip picks whatever version has a prebuilt wheel.

Return ONLY valid JSON:
{"files":[{"path":"backend/main.py","content":"full file contents"}],"run_instructions":"markdown, exact commands"}

No explanation, no markdown fences, just the raw JSON object."""


# ── Pydantic models ───────────────────────────────────────────────────────────

class SpecRequest(BaseModel):
    spec: str


class RefineRequest(BaseModel):
    existing_arch: dict
    feedback: str
    chat_history: list = []


class CodeRequest(BaseModel):
    architecture: dict


class RunRequest(BaseModel):
    files: list


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


def call_ollama(messages: list, _retries: int = 2) -> dict:
    """Call the Ollama cloud API using stdlib urllib (no timeout — model generates full JSON before sending)."""
    if not OLLAMA_API_KEY:
        raise HTTPException(status_code=500, detail="OLLAMA_API_KEY not set in .env")

    payload = json.dumps(
        {"model": "gemma4:31b-cloud", "messages": messages, "temperature": 0.3}
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://ollama.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {OLLAMA_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:   # no timeout — let the model finish
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=e.code, detail=f"Ollama API error: {detail}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Ollama API: {e.reason}")

    data = json.loads(body)
    raw = data["choices"][0]["message"]["content"]
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    # Sanitize invalid \u escapes (e.g. \u followed by non-hex or end of string)
    cleaned = re.sub(r'\\u(?![0-9a-fA-F]{4})', r'\\\\u', cleaned)
    try:
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError as e:
        # ponytail: the model occasionally emits structurally malformed JSON
        # (e.g. a stray unescaped quote in generated code). Retrying regenerates
        # the whole response rather than attempting to repair broken JSON.
        if _retries > 0:
            return call_ollama(messages, _retries=_retries - 1)
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON after retries: {e}\n\nRaw text: {cleaned}")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "key_set": bool(OLLAMA_API_KEY)}


@app.post("/api/architect")
async def architect(req: SpecRequest):
    return await run_in_threadpool(call_ollama, [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Architect this: {req.spec}"},
    ])


@app.post("/api/refine")
async def refine(req: RefineRequest):
    return await run_in_threadpool(call_ollama, [
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
        
    return await run_in_threadpool(call_ollama, [
        {"role": "system", "content": REASON_PROMPT},
        {"role": "user", "content": (
            f"Existing architecture:\n{json.dumps(req.existing_arch, indent=2)}\n\n"
            f"{history_str}"
            f"Engineer's prompt: {req.feedback}"
        )},
    ])


def _validate_file(path: str, content: str) -> dict:
    """Deterministic syntax check only — catches 'won't parse', not 'is wrong'.
    JSX/TS are skipped: node's --check can't parse JSX/TS without a transformer,
    and adding babel/tsc just for validation isn't worth the dependency."""
    ext = os.path.splitext(path)[1].lower()

    if ext == ".py":
        try:
            ast.parse(content)
            return {"path": path, "status": "valid"}
        except SyntaxError as e:
            return {"path": path, "status": "invalid", "error": f"SyntaxError: {e.msg} at line {e.lineno}"}

    if ext == ".json":
        try:
            json.loads(content)
            return {"path": path, "status": "valid"}
        except json.JSONDecodeError as e:
            return {"path": path, "status": "invalid", "error": f"JSONDecodeError: {e}"}

    if ext == ".js" and shutil.which("node"):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
            f.write(content)
            tmp_path = f.name
        try:
            result = subprocess.run(["node", "--check", tmp_path], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return {"path": path, "status": "valid"}
            return {"path": path, "status": "invalid", "error": result.stderr.strip()[:500]}
        finally:
            os.unlink(tmp_path)

    return {"path": path, "status": "skipped"}


def _detect_backend_entry(files: list) -> tuple:
    """Backend isn't always Python — the Coder can pick Node depending on the
    architecture's stated tech. Detect which entrypoint got generated."""
    paths = {f["path"] for f in files}
    if "backend/main.py" in paths:
        return "python", "main.py"
    if "backend/main.js" in paths:
        return "node", "main.js"
    return None, None


def _install_backend_deps(runtime: str, cwd: str, env: dict, timeout: int) -> dict:
    """Returns {} on success, or {"status": "invalid"/"error", "error": ...} on failure."""
    if runtime == "python":
        deps_dir = os.path.join(cwd, "_deps")
        req_path = os.path.join(cwd, "requirements.txt")
        if os.path.exists(req_path):
            try:
                pip = subprocess.run(
                    [sys.executable, "-m", "pip", "install", "--quiet", "--target", deps_dir, "-r", req_path],
                    capture_output=True, text=True, timeout=timeout,
                )
            except subprocess.TimeoutExpired:
                return {"error": f"pip install timed out after {timeout}s"}
            if pip.returncode != 0:
                return {"error": f"pip install failed: {pip.stderr.strip()[-800:]}"}
        env["PYTHONPATH"] = deps_dir + os.pathsep + env.get("PYTHONPATH", "")
        return {}
    if not shutil.which("npm"):
        return {"error": "npm not found on this machine"}
    try:
        npm = subprocess.run(["npm", "install"], cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"error": f"npm install timed out after {timeout}s"}
    if npm.returncode != 0:
        return {"error": f"npm install failed: {npm.stderr.strip()[:800]}"}
    return {}


def _boot_check_backend(files: list) -> dict:
    """Tier 2: actually try to start the generated backend (Python or Node).
    ponytail: runs as a plain subprocess on the host, not a container/microVM —
    fine for a local single-user tool (you'd `pip install`/`npm install` this
    yourself per Run Instructions anyway); get a real sandbox (Docker/
    Firecracker) before this is ever exposed to untrusted specs or other
    people's machines."""
    backend_files = [f for f in files if f["path"].startswith("backend/")]
    runtime, entry = _detect_backend_entry(backend_files)
    if not entry:
        return {"status": "skipped"}

    with tempfile.TemporaryDirectory() as tmp:
        for f in backend_files:
            rel = f["path"][len("backend/"):]
            full = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(full) or tmp, exist_ok=True)
            with open(full, "w") as fh:
                fh.write(f["content"])

        env = dict(os.environ)
        install = _install_backend_deps(runtime, tmp, env, timeout=120)
        if "error" in install:
            return {"status": "invalid", "error": install["error"]}

        cmd = [sys.executable, entry] if runtime == "python" else ["node", entry]
        proc = subprocess.Popen(
            cmd, cwd=tmp, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            _, stderr = proc.communicate(timeout=6)
            # exited on its own within the window == crashed (a live server keeps running)
            return {"status": "invalid", "error": f"Process exited immediately (code {proc.returncode}): {stderr.strip()[-800:]}"}
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            return {"status": "valid"}


def _run_frontend_smoke_test(frontend_url: str) -> dict:
    """Tier 4: fills every visible input/textarea with a dummy value, clicks
    the most likely submit button, and checks for (a) any console error or
    uncaught JS exception, or (b) a Tailwind red-* error element appearing
    afterward (relies on CODER_PROMPT rule 8's error-styling convention).
    ponytail: a heuristic smoke test, not a real E2E suite — catches 'the
    button doesn't actually work', not full user-flow coverage. Good enough
    for the failure mode we've actually seen (a silently-caught frontend bug
    that boot-checking the backend alone can't see)."""
    from playwright.sync_api import sync_playwright

    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" else None)
            page.on("pageerror", lambda exc: errors.append(f"uncaught exception: {exc}"))

            page.goto(frontend_url, wait_until="networkidle", timeout=15000)

            for el in page.locator("input, textarea").all():
                try:
                    input_type = (el.get_attribute("type") or "text").lower()
                    if input_type in ("checkbox", "radio", "hidden", "file"):
                        continue
                    value = "1" if input_type == "number" else ("test@example.com" if input_type == "email" else "Test")
                    el.fill(value)
                except Exception:
                    pass  # not fillable (e.g. disabled) -- not itself a bug

            submit = page.locator(
                "button[type=submit], button:has-text('Add'), button:has-text('Submit'), "
                "button:has-text('Save'), button:has-text('Create')"
            ).first
            if submit.count() > 0:
                submit.click()
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass  # request may still be genuinely slow, not necessarily a bug
                page.wait_for_timeout(500)  # let React finish re-rendering after the response lands

            red_error = page.locator("[class*='text-red-'], [class*='bg-red-'], [class*='border-red-']").first
            if red_error.count() > 0 and red_error.is_visible():
                errors.append(f"error state shown after submit: {red_error.inner_text()[:200]}")

            browser.close()
    except Exception as e:
        errors.append(f"smoke test crashed: {e}")

    if errors:
        return {"status": "invalid", "error": "; ".join(errors)[:800]}
    return {"status": "valid"}


def _run_checks(files: list) -> tuple:
    validations = [_validate_file(f["path"], f["content"]) for f in files]
    if any(v["status"] == "invalid" for v in validations):
        skipped = {"status": "skipped"}
        return validations, skipped, skipped, [v for v in validations if v["status"] == "invalid"]

    has_frontend = any(f["path"].startswith("frontend/") for f in files)
    frontend_check = {"status": "skipped"}

    if CURRENT_RUN is not None:
        # An app is live via Run App on these same ports -- never tear it
        # down just to run a background check. Skip rather than surprise-kill
        # the user's active session.
        boot_check = {"status": "skipped"}
    elif has_frontend:
        started = _start_full_stack(files)
        if not started["ok"]:
            boot_check = {"status": "invalid", "error": started["error"]}
        else:
            boot_check = {"status": "valid"}
            try:
                frontend_check = _run_frontend_smoke_test(started["frontend_url"])
            finally:
                _teardown_full_stack(started)
    else:
        boot_check = _boot_check_backend(files)

    failures = [v for v in validations if v["status"] == "invalid"]
    if boot_check["status"] == "invalid":
        failures.append({"path": "backend (boot)", "status": "invalid", "error": boot_check["error"]})
    if frontend_check["status"] == "invalid":
        failures.append({"path": "frontend (runtime)", "status": "invalid", "error": frontend_check["error"]})
    return validations, boot_check, frontend_check, failures


MAX_CODE_ATTEMPTS = 3


@app.post("/api/code")
async def generate_code(req: CodeRequest):
    messages = [
        {"role": "system", "content": CODER_PROMPT},
        {"role": "user", "content": (
            f"Architecture:\n{json.dumps(req.architecture, indent=2)}\n\nGenerate the code scaffold."
        )},
    ]

    result = await run_in_threadpool(call_ollama, messages)
    attempts = 1

    while True:
        validations, boot_check, frontend_check, failures = await run_in_threadpool(_run_checks, result.get("files", []))
        if not failures or attempts >= MAX_CODE_ATTEMPTS:
            break
        error_summary = "\n".join(f"- {v['path']}: {v['error']}" for v in failures)
        messages = messages + [
            {"role": "assistant", "content": json.dumps(result)},
            {"role": "user", "content": (
                f"These files failed validation:\n{error_summary}\n\n"
                "Return the complete corrected files JSON again in the same schema, fixing only these issues."
            )},
        ]
        result = await run_in_threadpool(call_ollama, messages)
        attempts += 1

    result["validation"] = validations
    result["boot_check"] = boot_check
    result["frontend_check"] = frontend_check
    result["attempts"] = attempts
    return result


# ── Live run (Tier 3): keep the generated app running and serve its UI ────────
# ponytail: one global run, not a per-user registry — this is a local single-
# user tool, not a hosted multi-tenant service. Plain subprocesses on the host,
# no container. Upgrade both if this ever needs concurrent runs or isolation.

RUN_BACKEND_PORT = 8000
RUN_FRONTEND_PORT = 8001
CURRENT_RUN = None


def _wait_for_port(port: int, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def _stop_current_run():
    global CURRENT_RUN
    if CURRENT_RUN is None:
        return
    for key in ("backend_proc", "static_proc"):
        proc = CURRENT_RUN.get(key)
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    tmp_dir = CURRENT_RUN.get("tmp_dir")
    if tmp_dir:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    CURRENT_RUN = None


atexit.register(_stop_current_run)


def _start_full_stack(files: list) -> dict:
    """Boots backend + builds/serves frontend. Caller owns teardown (via
    _teardown_full_stack) once done — this only starts things and never
    leaves a partial start running (cleans up on any failure)."""
    tmp = tempfile.mkdtemp(prefix="specforge_run_")
    for f in files:
        full = os.path.join(tmp, f["path"])
        os.makedirs(os.path.dirname(full) or tmp, exist_ok=True)
        with open(full, "w") as fh:
            fh.write(f["content"])

    backend_dir = os.path.join(tmp, "backend")
    frontend_dir = os.path.join(tmp, "frontend")

    backend_files = [f for f in files if f["path"].startswith("backend/")]
    runtime, entry = _detect_backend_entry(backend_files)
    if not entry:
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "No backend/main.py or backend/main.js in generated files"}
    if not os.path.isdir(frontend_dir):
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "No frontend/ in generated files"}

    env = dict(os.environ)
    install = _install_backend_deps(runtime, backend_dir, env, timeout=180)
    if "error" in install:
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": f"Backend dependency install failed: {install['error']}"}

    backend_cmd = [sys.executable, entry] if runtime == "python" else ["node", entry]
    backend_proc = subprocess.Popen(
        backend_cmd, cwd=backend_dir, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    if not _wait_for_port(RUN_BACKEND_PORT, timeout=15):
        backend_proc.kill()
        _, stderr = backend_proc.communicate()
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": f"Backend did not start on port {RUN_BACKEND_PORT}: {stderr.strip()[-800:]}"}

    if not shutil.which("npm"):
        backend_proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "npm not found on this machine"}

    try:
        npm_install = subprocess.run(["npm", "install"], cwd=frontend_dir, capture_output=True, text=True, timeout=240)
    except subprocess.TimeoutExpired:
        backend_proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "npm install timed out after 240s"}
    if npm_install.returncode != 0:
        backend_proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": f"npm install failed: {npm_install.stderr.strip()[:800]}"}

    try:
        npm_build = subprocess.run(["npm", "run", "build"], cwd=frontend_dir, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        backend_proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "npm run build timed out after 180s"}

    dist_dir = os.path.join(frontend_dir, "dist")
    if npm_build.returncode != 0 or not os.path.isdir(dist_dir):
        alt = os.path.join(frontend_dir, "build")  # in case the model ignored rule 7 and built a CRA app
        if os.path.isdir(alt):
            dist_dir = alt
        else:
            backend_proc.kill()
            shutil.rmtree(tmp, ignore_errors=True)
            # esbuild/rollup put the actual "file:line: error" near the top of
            # stderr, not the tail (which is just the bundler's own stack trace)
            return {"ok": False, "error": f"npm run build failed: {npm_build.stderr.strip()[:1200]}"}

    static_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(RUN_FRONTEND_PORT), "--directory", dist_dir],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    if not _wait_for_port(RUN_FRONTEND_PORT, timeout=10):
        backend_proc.kill()
        static_proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "Static file server for the frontend failed to start"}

    return {
        "ok": True, "tmp": tmp, "backend_proc": backend_proc, "static_proc": static_proc,
        "backend_url": f"http://localhost:{RUN_BACKEND_PORT}",
        "frontend_url": f"http://localhost:{RUN_FRONTEND_PORT}",
    }


def _teardown_full_stack(started: dict):
    for key in ("backend_proc", "static_proc"):
        proc = started.get(key)
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    if started.get("tmp"):
        shutil.rmtree(started["tmp"], ignore_errors=True)


def _run_stack(files: list) -> dict:
    global CURRENT_RUN
    _stop_current_run()
    started = _start_full_stack(files)
    if not started["ok"]:
        return {"status": "error", "error": started["error"]}
    CURRENT_RUN = {"tmp_dir": started["tmp"], "backend_proc": started["backend_proc"], "static_proc": started["static_proc"]}
    return {"status": "running", "backend_url": started["backend_url"], "frontend_url": started["frontend_url"]}


@app.post("/api/code/run")
async def run_code(req: RunRequest):
    return await run_in_threadpool(_run_stack, req.files)


@app.post("/api/code/stop")
async def stop_code():
    await run_in_threadpool(_stop_current_run)
    return {"status": "stopped"}


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
                    "model": "gemma4:31b-cloud",
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


# ── Serve built React frontend ─────────────────────────────────────────────────

FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
