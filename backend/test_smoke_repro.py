from main import _start_full_stack, _teardown_full_stack, _run_frontend_smoke_test

BACKEND_MAIN = """
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

class Expense(BaseModel):
    description: str
    split_with: list[str]  # backend expects split_with

@app.post("/expenses")
def add_expense(e: Expense):
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
"""

FRONTEND_PACKAGE_JSON = """{
  "name": "test-frontend",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "devDependencies": { "vite": "^5.4.0" }
}"""

# Reproduces the real bug faithfully: frontend key ("split_between") doesn't
# match backend's Pydantic field ("split_with") -> 422 -> caught gracefully
# in a try/catch -> raw response text rendered in a Tailwind red-styled div,
# exactly like the actual generated App.jsx did.
INDEX_HTML = """<!doctype html>
<html><body>
  <input id="description" type="text" />
  <input id="split" type="text" />
  <button id="go">Add Expense</button>
  <div id="result"></div>
  <script>
    document.getElementById('go').addEventListener('click', async () => {
      const el = document.getElementById('result');
      try {
        const body = {
          description: document.getElementById('description').value,
          split_between: document.getElementById('split').value.split(','),
        };
        const res = await fetch('http://localhost:8000/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        el.className = 'text-green-700';
        el.textContent = 'ok';
      } catch (e) {
        el.className = 'p-4 bg-red-50 border border-red-200 text-red-800';
        el.textContent = e.message;
      }
    });
  </script>
</body></html>
"""

files = [
    {"path": "backend/main.py", "content": BACKEND_MAIN},
    {"path": "frontend/package.json", "content": FRONTEND_PACKAGE_JSON},
    {"path": "frontend/index.html", "content": INDEX_HTML},
]


def test():
    started = _start_full_stack(files)
    try:
        assert started["ok"], started
        result = _run_frontend_smoke_test(started["frontend_url"])
        assert result["status"] == "invalid", result
        assert "error state shown" in result["error"], result
        print("Correctly caught the split_with/split_between mismatch:", result["error"])
    finally:
        _teardown_full_stack(started)
    print("Repro test passed.")


if __name__ == "__main__":
    test()
