import pytest
from fastapi.testclient import TestClient
from app.main import app
import tempfile
import os

client = TestClient(app)

def test_parse_document_success(monkeypatch):
    from app.api.routers import parse

    def mock_parse_document(file_path):
        return f"# Converted {os.path.basename(file_path)}", {"sourceFormat": "txt"}

    monkeypatch.setattr(parse, "parse_document", mock_parse_document)

    # Create a dummy file
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        tmp.write(b"Hello World")
        tmp_name = tmp.name

    try:
        with open(tmp_name, "rb") as f:
            response = client.post("/parse", files={"file": ("test.txt", f, "text/plain")})
        
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test.txt"
        assert "# Converted" in data["markdown"]
    finally:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)

def test_parse_document_missing_file():
    response = client.post("/parse")
    assert response.status_code == 422 # Unprocessable Entity (Missing file field)
