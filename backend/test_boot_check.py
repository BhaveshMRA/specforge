from main import _boot_check_backend

WORKING_MAIN = """
from fastapi import FastAPI
app = FastAPI()

@app.get("/")
def root():
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
"""

CRASHING_MAIN = """
import this_module_does_not_exist
"""

NODE_PACKAGE_JSON = '{"name": "test-backend", "version": "1.0.0"}'

NODE_WORKING_MAIN = """
const http = require("http");
http.createServer((req, res) => { res.end("ok"); }).listen(8000);
"""

NODE_CRASHING_MAIN = """
throw new Error("boom");
"""


def test():
    ok = _boot_check_backend([{"path": "backend/main.py", "content": WORKING_MAIN}])
    assert ok["status"] == "valid", ok

    bad = _boot_check_backend([{"path": "backend/main.py", "content": CRASHING_MAIN}])
    assert bad["status"] == "invalid", bad
    assert "this_module_does_not_exist" in bad["error"], bad

    skip = _boot_check_backend([{"path": "frontend/src/App.jsx", "content": "<div/>"}])
    assert skip["status"] == "skipped", skip

    node_ok = _boot_check_backend([
        {"path": "backend/package.json", "content": NODE_PACKAGE_JSON},
        {"path": "backend/main.js", "content": NODE_WORKING_MAIN},
    ])
    assert node_ok["status"] == "valid", node_ok

    node_bad = _boot_check_backend([
        {"path": "backend/package.json", "content": NODE_PACKAGE_JSON},
        {"path": "backend/main.js", "content": NODE_CRASHING_MAIN},
    ])
    assert node_bad["status"] == "invalid", node_bad
    assert "boom" in node_bad["error"], node_bad

    print("All boot-check tests passed.")


if __name__ == "__main__":
    test()
