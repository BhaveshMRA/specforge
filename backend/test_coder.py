import httpx

architecture = {
    "project_name": "Test App",
    "summary": "A minimal test architecture.",
    "layers": [
        {"id": "user_experience", "name": "User Experience", "color": "blue", "components": [
            {"id": "msg_input", "name": "Message Input", "tech": "Chat UI", "connects_to": ["api_gateway"]},
            {"id": "response_view", "name": "Response Display", "tech": "Streaming UI", "connects_to": []},
        ]},
        {"id": "backend", "name": "Backend", "color": "green", "components": [
            {"id": "api_gateway", "name": "API Gateway", "tech": "FastAPI", "connects_to": ["response_view"]},
        ]},
    ],
    "key_flows": ["Step 1: User submits via msg_input -> Step 2: api_gateway responds -> Step 3: response_view shows result"],
}

try:
    print("Sending POST request to http://localhost:8002/api/code...")
    response = httpx.post(
        "http://localhost:8002/api/code",
        json={"architecture": architecture},
        timeout=180.0,
    )
    print("Status Code:", response.status_code)
    data = response.json()
    files = data.get("files", [])
    print(f"Files returned: {len(files)}")
    for f in files:
        assert "path" in f and "content" in f, f"malformed file entry: {f}"
    assert len(files) > 0, "expected at least one file"
    print("OK — files well-formed.")
except Exception as e:
    print("Error:", e)
