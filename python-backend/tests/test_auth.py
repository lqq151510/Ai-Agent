"""Authentication and first-run provisioning behaviour."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import CREDENTIALS


def test_health_ready_is_public(client: TestClient) -> None:
    response = client.get("/api/v1/system/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["database"] == "ok"
    assert body["desktopMode"] is True


def test_register_then_login(client: TestClient) -> None:
    register = client.post("/api/v1/auth/register", json=CREDENTIALS)
    assert register.status_code == 200
    assert register.json()["accessToken"]

    login = client.post("/api/v1/auth/login", json=CREDENTIALS)
    assert login.status_code == 200
    body = login.json()
    assert body["accessToken"] and body["refreshToken"]
    assert body["expiresIn"] > 0
    assert body["tokenType"] == "Bearer"


def test_duplicate_register_conflict_message_contains_already(client: TestClient) -> None:
    assert client.post("/api/v1/auth/register", json=CREDENTIALS).status_code == 200
    duplicate = client.post("/api/v1/auth/register", json=CREDENTIALS)
    assert duplicate.status_code == 409
    payload = duplicate.json()
    # The desktop main process matches "already" to treat this as benign.
    assert "already" in payload["message"].lower()
    assert payload["code"] == "CONFLICT"


def test_bad_password_message_triggers_desktop_fallback(client: TestClient) -> None:
    client.post("/api/v1/auth/register", json=CREDENTIALS)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": CREDENTIALS["email"], "password": "wrong-password-1234"},
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["message"] == "Invalid email or password"
    assert payload["code"] == "INVALID_CREDENTIALS"


def test_unknown_email_is_401_and_leaks_nothing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever12345"}
    )
    assert response.status_code == 401
    assert "nobody" not in response.text


def test_short_password_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register", json={"email": "short@example.com", "password": "123"}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "BAD_REQUEST"


def test_invalid_email_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register", json={"email": "not-an-email", "password": "Desktop!1234Aa"}
    )
    assert response.status_code == 400


def test_missing_token_is_401(client: TestClient) -> None:
    for path in ("/api/v1/knowledge-items", "/api/v1/tags", "/api/v1/settings/profile"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.json()["code"] == "UNAUTHORIZED"


def test_malformed_token_is_401(client: TestClient) -> None:
    response = client.get(
        "/api/v1/knowledge-items", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


def test_me_returns_preferences(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/api/v1/auth/me", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == CREDENTIALS["email"]
    assert body["organizeMode"] == "manual"
    assert body["privacyMode"] == "local_first"


def test_refresh_issues_new_access_token(client: TestClient) -> None:
    registered = client.post("/api/v1/auth/register", json=CREDENTIALS).json()
    response = client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["refreshToken"]}
    )
    assert response.status_code == 200
    refreshed = response.json()["accessToken"]
    assert client.get(
        "/api/v1/knowledge-items", headers={"Authorization": f"Bearer {refreshed}"}
    ).status_code == 200


def test_access_token_is_not_accepted_as_refresh_token(client: TestClient) -> None:
    registered = client.post("/api/v1/auth/register", json=CREDENTIALS).json()
    response = client.post(
        "/api/v1/auth/refresh", json={"refreshToken": registered["accessToken"]}
    )
    assert response.status_code == 401


def test_unknown_route_uses_unified_error_payload(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist", headers={"Authorization": "Bearer x"})
    assert response.status_code == 404
    assert set(response.json()) >= {"message", "code"}
