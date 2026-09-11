"""Model source management: masking, conflicts, defaults and connectivity."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from knowledge_desk.config import Settings
from knowledge_desk.domain.models import ModelSource
from knowledge_desk.infrastructure import llm
from knowledge_desk.main import create_app

DRAFT = {
    "providerType": "deepseek",
    "name": "DeepSeek 官方",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-abcdefghijklmnop1234",
    "defaultModel": "deepseek-chat",
    "enabled": True,
    "isDefault": True,
}


def _create(client: TestClient, auth: dict[str, str], **overrides):
    payload = {**DRAFT, **overrides}
    return client.post("/api/v1/model-sources", json=payload, headers=auth)


def test_create_masks_credential_and_never_echoes_it(
    client: TestClient, auth: dict[str, str], session_factory
) -> None:
    response = _create(client, auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["apiKeyMasked"] == "sk-…1234"
    assert "apiKey" not in body
    assert "sk-abcdefghijklmnop1234" not in response.text
    assert body["isDefault"] is True
    assert body["providerType"] == "deepseek"

    session = session_factory()
    try:
        stored = session.execute(select(ModelSource)).scalars().one()
        assert stored.api_key_encrypted.startswith("enc:v1:")
        assert "sk-abcdefghijklmnop1234" not in stored.api_key_encrypted
    finally:
        session.close()


def test_list_returns_only_masked_values(client: TestClient, auth: dict[str, str]) -> None:
    _create(client, auth)
    response = client.get("/api/v1/model-sources", headers=auth)
    assert response.status_code == 200
    entries = response.json()
    assert len(entries) == 1
    assert entries[0]["apiKeyMasked"] == "sk-…1234"
    assert "sk-abcdefghijklmnop1234" not in response.text


def test_duplicate_name_conflicts(client: TestClient, auth: dict[str, str]) -> None:
    assert _create(client, auth).status_code == 200
    duplicate = _create(client, auth, apiKey="sk-anotherkey1234")
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "CONFLICT"


def test_missing_name_or_url_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    assert _create(client, auth, name="").status_code == 400
    assert _create(client, auth, baseUrl="").status_code == 400
    assert _create(client, auth, providerType="not-a-provider").status_code == 400
    assert _create(client, auth, defaultModel="").status_code == 400


def test_update_keeps_credential_when_key_omitted(client: TestClient, auth: dict[str, str]) -> None:
    source_id = _create(client, auth).json()["id"]

    updated = client.put(
        f"/api/v1/model-sources/{source_id}",
        json={"name": "DeepSeek 改名", "defaultModel": "deepseek-reasoner"},
        headers=auth,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "DeepSeek 改名"
    assert updated.json()["defaultModel"] == "deepseek-reasoner"
    assert updated.json()["apiKeyMasked"] == "sk-…1234"


def test_update_blank_key_does_not_erase_credential(client: TestClient, auth: dict[str, str]) -> None:
    source_id = _create(client, auth).json()["id"]
    updated = client.put(
        f"/api/v1/model-sources/{source_id}", json={"apiKey": ""}, headers=auth
    )
    assert updated.json()["apiKeyMasked"] == "sk-…1234"


def test_update_replaces_credential(client: TestClient, auth: dict[str, str]) -> None:
    source_id = _create(client, auth).json()["id"]
    updated = client.put(
        f"/api/v1/model-sources/{source_id}", json={"apiKey": "sk-newkey5678"}, headers=auth
    )
    assert updated.json()["apiKeyMasked"] == "sk-…5678"


def test_enable_disable_and_set_default(client: TestClient, auth: dict[str, str]) -> None:
    first = _create(client, auth).json()
    second = _create(
        client, auth, name="本地兼容端点", providerType="local_compatible", isDefault=False
    ).json()

    assert client.post(
        f"/api/v1/model-sources/{first['id']}/disable", headers=auth
    ).json()["enabled"] is False
    assert client.post(
        f"/api/v1/model-sources/{first['id']}/enable", headers=auth
    ).json()["enabled"] is True

    switched = client.post(f"/api/v1/model-sources/{second['id']}/set-default", headers=auth)
    assert switched.json()["isDefault"] is True

    entries = {entry["id"]: entry for entry in client.get("/api/v1/model-sources", headers=auth).json()}
    assert entries[second["id"]]["isDefault"] is True
    assert entries[first["id"]]["isDefault"] is False


def test_delete_clears_preferences(client: TestClient, auth: dict[str, str]) -> None:
    source_id = _create(client, auth).json()["id"]
    client.put(
        "/api/v1/settings/profile",
        json={"defaultModelSourceId": source_id, "summaryModelSourceId": source_id},
        headers=auth,
    )

    assert client.delete(f"/api/v1/model-sources/{source_id}", headers=auth).status_code == 204
    assert client.get("/api/v1/model-sources", headers=auth).json() == []

    profile = client.get("/api/v1/settings/profile", headers=auth).json()
    assert profile["defaultModelSourceId"] is None
    assert profile["summaryModelSourceId"] is None


def test_binding_unknown_source_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        "/api/v1/settings/profile",
        json={"defaultModelSourceId": "11111111-2222-3333-4444-555555555555"},
        headers=auth,
    )
    assert response.status_code == 400


def test_unknown_source_id_is_404(client: TestClient, auth: dict[str, str]) -> None:
    missing = "11111111-2222-3333-4444-555555555555"
    assert client.put(f"/api/v1/model-sources/{missing}", json={}, headers=auth).status_code == 404
    assert client.delete(f"/api/v1/model-sources/{missing}", headers=auth).status_code == 404
    assert client.post(f"/api/v1/model-sources/{missing}/enable", headers=auth).status_code == 404


def test_cross_user_model_source_isolation(
    client: TestClient, auth: dict[str, str], second_auth: dict[str, str]
) -> None:
    source_id = _create(client, auth).json()["id"]
    assert client.get("/api/v1/model-sources", headers=second_auth).json() == []
    assert client.delete(f"/api/v1/model-sources/{source_id}", headers=second_auth).status_code == 404


def test_connectivity_success_updates_status(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    source_id = _create(client, auth).json()["id"]

    monkeypatch.setattr(
        llm.ChatClient, "complete", lambda self, **_k: llm.ChatCompletion(text="pong", model="test")
    )

    response = client.post(f"/api/v1/model-sources/{source_id}/test", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["message"] == "连接成功"
    assert body["checkedAt"]

    entry = client.get("/api/v1/model-sources", headers=auth).json()[0]
    assert entry["lastCheckStatus"] == "ok"


def test_connectivity_failure_is_masked(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    source_id = _create(client, auth).json()["id"]

    def _boom(self, **_kwargs):
        raise ConnectionError("Failed to connect to api.deepseek.com with key sk-abcdefghijklmnop1234")

    monkeypatch.setattr(llm.ChatClient, "complete", _boom)

    response = client.post(f"/api/v1/model-sources/{source_id}/test", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "error"
    assert "sk-abcdefghijklmnop1234" not in response.text

    entry = client.get("/api/v1/model-sources", headers=auth).json()[0]
    assert entry["lastCheckStatus"] == "error"
    assert "sk-abcdefghijklmnop1234" not in entry["lastCheckMessage"]


def test_credential_storage_requires_an_encryption_key(tmp_path, auth_factory) -> None:
    settings = Settings(
        data_dir=tmp_path / "no-key",
        jwt_secret="no-encryption-key-jwt-secret-tests-only",
        db_encryption_key=None,
        desktop_mode=True,
        log_level="WARNING",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        auth = auth_factory(client)
        response = _create(client, auth)
        assert response.status_code == 503
        assert response.json()["code"] == "ENCRYPTION_UNAVAILABLE"
        assert "sk-abcdefghijklmnop1234" not in response.text


def test_source_without_credential_is_allowed(client: TestClient, auth: dict[str, str]) -> None:
    response = _create(client, auth, apiKey="")
    assert response.status_code == 200
    assert response.json()["apiKeyMasked"] is None

    test_result = client.post(
        f"/api/v1/model-sources/{response.json()['id']}/test", headers=auth
    )
    assert test_result.status_code == 200
    assert test_result.json()["status"] == "error"
