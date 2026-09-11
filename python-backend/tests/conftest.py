"""Shared pytest fixtures: an isolated on-disk data directory per test."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from knowledge_desk.config import Settings
from knowledge_desk.main import create_app

CREDENTIALS = {
    "email": "desktop-test@example.com",
    "password": "Desktop!test1234Aa",
}
SECOND_CREDENTIALS = {
    "email": "second-user@example.com",
    "password": "Desktop!test5678Bb",
}


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        host="127.0.0.1",
        port=18080,
        desktop_mode=True,
        jwt_secret="test-jwt-secret-do-not-use-in-production",
        db_encryption_key="test-encryption-key-material",
        log_level="WARNING",
        organize_no_model_policy="heuristic",
        llm_timeout_seconds=0.05,
    )


@pytest.fixture()
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture()
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def session_factory(app):
    return app.state.session_factory


@pytest.fixture()
def auth_factory():
    """Register the standard test account against an arbitrary client."""

    def _register(target: TestClient) -> dict[str, str]:
        response = target.post("/api/v1/auth/register", json=CREDENTIALS)
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    return _register


@pytest.fixture()
def auth(client: TestClient, auth_factory) -> dict[str, str]:
    return auth_factory(client)


@pytest.fixture()
def user_id(client: TestClient, auth: dict[str, str]) -> str:
    response = client.get("/api/v1/auth/me", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()["id"]


@pytest.fixture()
def second_auth(client: TestClient) -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json=SECOND_CREDENTIALS)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def import_snippet(client: TestClient, auth: dict[str, str], content: str, title: str | None = None):
    payload = {"content": content}
    if title:
        payload["title"] = title
    response = client.post("/api/v1/knowledge-items/import/snippet", json=payload, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()
