from main import _start_full_stack, _teardown_full_stack, _detect_all_backend_entries
import urllib.request

# Reproduces the real bug: an API gateway (Node, port 8000) that proxies to a
# separate intelligence/worker service (Python, port 8001) in its own
# subdirectory. The old single-entrypoint sandbox only ever started the
# gateway, so gateway -> logic calls always failed with ECONNREFUSED.

GATEWAY_MAIN = """
const http = require("http");
http.createServer(async (req, res) => {
  try {
    const r = await fetch("http://localhost:8001/hello");
    const data = await r.json();
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(502);
    res.end(String(e));
  }
}).listen(8000);
"""

GATEWAY_PACKAGE_JSON = '{"name": "gateway", "version": "1.0.0"}'

LOGIC_MAIN = """
from fastapi import FastAPI
app = FastAPI()

@app.get("/hello")
def hello():
    return {"from": "logic"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
"""

LOGIC_REQUIREMENTS = "fastapi\nuvicorn\n"

FRONTEND_PACKAGE_JSON = """{
  "name": "test-frontend",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "devDependencies": { "vite": "^5.4.0" }
}"""

FRONTEND_INDEX_HTML = "<!doctype html><html><body><h1>multi-backend test</h1></body></html>"

FILES = [
    {"path": "backend/main.js", "content": GATEWAY_MAIN},
    {"path": "backend/package.json", "content": GATEWAY_PACKAGE_JSON},
    {"path": "backend/logic/main.py", "content": LOGIC_MAIN},
    {"path": "backend/logic/requirements.txt", "content": LOGIC_REQUIREMENTS},
    {"path": "frontend/package.json", "content": FRONTEND_PACKAGE_JSON},
    {"path": "frontend/index.html", "content": FRONTEND_INDEX_HTML},
]


def test():
    entries = _detect_all_backend_entries([f for f in FILES if f["path"].startswith("backend/")])
    assert len(entries) == 2, entries
    assert ("node", "backend", "main.js") in entries, entries
    assert ("python", "backend/logic", "main.py") in entries, entries

    started = _start_full_stack(FILES)
    try:
        assert started["ok"], started
        with urllib.request.urlopen(started["backend_url"] + "/", timeout=10) as r:
            body = r.read().decode()
            assert '"from": "logic"' in body or '"from":"logic"' in body, body
        print("Gateway successfully reached the separate logic service:", body)
    finally:
        _teardown_full_stack(started)

    print("Multi-backend test passed.")


if __name__ == "__main__":
    test()
