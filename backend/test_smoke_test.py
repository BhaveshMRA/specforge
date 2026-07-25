from main import _start_full_stack, _teardown_full_stack, _run_frontend_smoke_test, _stop_current_run

BACKEND_MAIN = """
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

@app.get("/")
def root():
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

# Reproduces the exact bug class found in this session: an undefined variable
# reference inside the click handler, caught by the app's own try/catch so it
# never surfaces as a console error or uncaught exception on its own.
BUGGY_INDEX_HTML = """<!doctype html>
<html><body>
  <input id="name" type="text" />
  <button id="go">Submit</button>
  <div id="result"></div>
  <script>
    document.getElementById('go').addEventListener('click', () => {
      try {
        const parsed = document.getElementById('name').value.trim();
        const payload = { ...{}, doesNotExist };  // ReferenceError, caught below
        document.getElementById('result').className = 'text-green-700';
        document.getElementById('result').textContent = 'ok: ' + JSON.stringify(payload);
      } catch (e) {
        document.getElementById('result').className = 'text-red-700 bg-red-50';
        document.getElementById('result').textContent = 'Error adding item. Please check your inputs.';
      }
    });
  </script>
</body></html>
"""

WORKING_INDEX_HTML = BUGGY_INDEX_HTML.replace(
    "const payload = { ...{}, doesNotExist };  // ReferenceError, caught below",
    "const payload = { name: parsed };",
)


def _files(index_html):
    return [
        {"path": "backend/main.py", "content": BACKEND_MAIN},
        {"path": "frontend/package.json", "content": FRONTEND_PACKAGE_JSON},
        {"path": "frontend/index.html", "content": index_html},
    ]


def test():
    started = _start_full_stack(_files(BUGGY_INDEX_HTML))
    try:
        assert started["ok"], started
        result = _run_frontend_smoke_test(started["frontend_url"])
        assert result["status"] == "invalid", result
        assert "error state shown" in result["error"], result
        print("Buggy app correctly flagged as invalid:", result["error"])
    finally:
        _teardown_full_stack(started)

    started = _start_full_stack(_files(WORKING_INDEX_HTML))
    try:
        assert started["ok"], started
        result = _run_frontend_smoke_test(started["frontend_url"])
        assert result["status"] == "valid", result
        print("Working app correctly passed.")
    finally:
        _teardown_full_stack(started)

    print("All smoke-test checks passed.")


if __name__ == "__main__":
    test()
