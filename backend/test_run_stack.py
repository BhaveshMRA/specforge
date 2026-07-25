import urllib.request
from main import _run_stack, _stop_current_run, RUN_BACKEND_PORT, RUN_FRONTEND_PORT

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

FRONTEND_INDEX_HTML = "<!doctype html><html><body><h1>hello from generated app</h1></body></html>"

FILES = [
    {"path": "backend/main.py", "content": BACKEND_MAIN},
    {"path": "frontend/package.json", "content": FRONTEND_PACKAGE_JSON},
    {"path": "frontend/index.html", "content": FRONTEND_INDEX_HTML},
]


def test():
    try:
        result = _run_stack(FILES)
        assert result["status"] == "running", result
        assert result["backend_url"] == f"http://localhost:{RUN_BACKEND_PORT}", result
        assert result["frontend_url"] == f"http://localhost:{RUN_FRONTEND_PORT}", result

        with urllib.request.urlopen(result["backend_url"] + "/") as r:
            assert r.status == 200, r.status

        with urllib.request.urlopen(result["frontend_url"] + "/") as r:
            body = r.read().decode()
            assert "hello from generated app" in body, body

        print("All run-stack checks passed.")
    finally:
        _stop_current_run()


if __name__ == "__main__":
    test()
