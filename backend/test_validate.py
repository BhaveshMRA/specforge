from main import _validate_file


def test():
    ok = _validate_file("backend/app.py", "def f():\n    return 1\n")
    assert ok["status"] == "valid", ok

    bad = _validate_file("backend/app.py", "def f(:\n")
    assert bad["status"] == "invalid", bad

    j_ok = _validate_file("frontend/package.json", '{"a": 1}')
    assert j_ok["status"] == "valid", j_ok

    j_bad = _validate_file("frontend/package.json", '{"a": }')
    assert j_bad["status"] == "invalid", j_bad

    skip = _validate_file("frontend/src/App.jsx", "<div>hi</div>")
    assert skip["status"] == "skipped", skip

    print("All validation checks passed.")


if __name__ == "__main__":
    test()
