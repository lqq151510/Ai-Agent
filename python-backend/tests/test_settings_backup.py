"""Backup export / merge-import against the desktop backup contract."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import import_snippet

ARTICLE = (
    "备份与恢复需要覆盖知识条目、标签与复习进度。\n\n"
    "模型源凭据绝不进入备份文件，恢复时也不会被写回。"
)


def _seed(client: TestClient, auth: dict[str, str]) -> dict:
    first = import_snippet(client, auth, ARTICLE, "备份条目一")
    second = import_snippet(client, auth, "第二条用于备份的内容，包含足够的词语。", "备份条目二")

    organized = client.post(f"/api/v1/knowledge-items/{first['id']}/organize", headers=auth)
    assert organized.status_code == 200
    client.put(
        f"/api/v1/knowledge-items/{second['id']}",
        json={"tags": ["备份", "恢复"], "summary": "人工摘要"},
        headers=auth,
    )
    client.post(
        f"/api/v1/knowledge-reviews/{first['id']}/complete", json={"rating": "good"}, headers=auth
    )
    client.post(f"/api/v1/knowledge-items/{second['id']}/archive", headers=auth)
    return {"first": first, "second": second}


def test_export_shape_matches_contract(client: TestClient, auth: dict[str, str]) -> None:
    _seed(client, auth)

    response = client.get("/api/v1/settings/export", headers=auth)
    assert response.status_code == 200
    body = response.json()

    assert body["schemaVersion"] == 1
    assert body["exportedAt"]
    assert body["modelSourcesIncluded"] is False
    assert body["preferences"]["organizeMode"] == "manual"
    assert body["preferences"]["privacyMode"] == "local_first"

    assert len(body["tags"]) == 2
    assert all(tag["id"] and tag["name"] and tag["createdAt"] for tag in body["tags"])

    assert len(body["knowledgeItems"]) == 2
    for item in body["knowledgeItems"]:
        assert item["id"] and item["sourceType"] and item["title"]
        assert isinstance(item["rawContent"], str)
        assert item["status"]
        assert isinstance(item["wordCount"], int)
        assert item["createdAt"] and item["updatedAt"]
        assert isinstance(item["tagIds"], list)

    assert len(body["reviewStates"]) == 1
    state = body["reviewStates"][0]
    assert state["intervalDays"] >= 1
    assert state["easeFactor"] >= 1.3
    assert state["repetitions"] >= 0
    assert state["lastRating"] == "good"
    assert state["lastReviewedAt"] and state["createdAt"] and state["updatedAt"]

    # No credential and no host path may appear anywhere in the export.
    assert "apiKey" not in response.text
    assert "/Users" not in response.text


def test_export_excludes_model_credentials(client: TestClient, auth: dict[str, str]) -> None:
    created = client.post(
        "/api/v1/model-sources",
        json={
            "providerType": "openai",
            "name": "备份用模型源",
            "baseUrl": "https://api.openai.com/v1",
            "apiKey": "sk-backupsecret1234",
            "defaultModel": "gpt-4o-mini",
        },
        headers=auth,
    )
    assert created.status_code == 200

    body = client.get("/api/v1/settings/export", headers=auth).json()
    assert body["modelSourcesIncluded"] is False
    assert "sk-backupsecret1234" not in str(body)


def test_import_merges_into_another_user(
    client: TestClient, auth: dict[str, str], second_auth: dict[str, str]
) -> None:
    _seed(client, auth)
    backup = client.get("/api/v1/settings/export", headers=auth).json()

    assert client.get("/api/v1/knowledge-items", headers=second_auth).json()["total"] == 0

    response = client.post("/api/v1/settings/import", json=backup, headers=second_auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["importedItems"] == 2
    assert body["createdTags"] == 2
    assert body["restoredReviewStates"] == 1
    assert body["preferencesRestored"] is False
    assert body["modelSourcesRestored"] is False
    assert body["message"]

    listing = client.get(
        "/api/v1/knowledge-items", params={"page": 1, "pageSize": 20}, headers=second_auth
    ).json()
    assert listing["total"] == 2

    statuses = {item["status"] for item in listing["items"]}
    assert "archived" in statuses and "ready" in statuses

    tags = client.get("/api/v1/tags", headers=second_auth).json()
    assert {tag["name"] for tag in tags} == {"备份", "恢复"}

    queue_summary = client.get("/api/v1/knowledge-reviews/summary", headers=second_auth).json()
    assert queue_summary["dueCount"] == 0  # restored schedules are in the future


def test_import_is_idempotent(client: TestClient, auth: dict[str, str]) -> None:
    _seed(client, auth)
    backup = client.get("/api/v1/settings/export", headers=auth).json()

    first = client.post("/api/v1/settings/import", json=backup, headers=auth).json()
    assert first["importedItems"] == 0  # all ids already present

    second = client.post("/api/v1/settings/import", json={**backup, "__retry": True}, headers=auth).json()
    assert second["importedItems"] == 0


def test_unsupported_backup_version_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    _seed(client, auth)
    backup = client.get("/api/v1/settings/export", headers=auth).json()

    assert client.post(
        "/api/v1/settings/import", json={**backup, "schemaVersion": 2}, headers=auth
    ).status_code == 400
    assert client.post(
        "/api/v1/settings/import", json={**backup, "modelSourcesIncluded": True}, headers=auth
    ).status_code == 400


def test_restored_items_remain_searchable(
    client: TestClient, auth: dict[str, str], second_auth: dict[str, str]
) -> None:
    _seed(client, auth)
    backup = client.get("/api/v1/settings/export", headers=auth).json()
    client.post("/api/v1/settings/import", json=backup, headers=second_auth)

    found = client.get(
        "/api/v1/knowledge-items/search", params={"q": "备份条目"}, headers=second_auth
    ).json()
    assert found["total"] == 2


def test_profile_updates(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        "/api/v1/settings/profile",
        json={"displayName": "泽宝", "organizeMode": "auto", "privacyMode": "cloud_first"},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["displayName"] == "泽宝"
    assert body["organizeMode"] == "auto"
    assert body["privacyMode"] == "cloud_first"

    assert client.put(
        "/api/v1/settings/profile", json={"organizeMode": "sometimes"}, headers=auth
    ).status_code == 400
