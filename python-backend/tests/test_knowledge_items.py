"""Knowledge item lifecycle: import, list, search, edit, archive, restore."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import import_snippet

SNIPPET_TEXT = (
    "FastAPI 是一个现代 Python Web 框架。它使用 Pydantic 做请求校验，"
    "并且原生支持 async/await。FastAPI 的依赖注入让测试变得简单，FastAPI 也是。"
)


def test_import_snippet_creates_inbox_item(client: TestClient, auth: dict[str, str]) -> None:
    item = import_snippet(client, auth, SNIPPET_TEXT, "FastAPI 笔记")
    assert item["status"] == "inbox"
    assert item["title"] == "FastAPI 笔记"
    assert item["sourceType"] == "snippet"
    assert item["wordCount"] > 0
    assert item["language"] == "zh"
    assert len(item["id"]) == 36
    assert item["createdAt"] and item["updatedAt"]


def test_import_web_requires_http_url(client: TestClient, auth: dict[str, str]) -> None:
    bad = client.post(
        "/api/v1/knowledge-items/import/web",
        json={"url": "file:///etc/passwd", "content": "x"},
        headers=auth,
    )
    assert bad.status_code == 400

    good = client.post(
        "/api/v1/knowledge-items/import/web",
        json={"url": "https://example.com/article", "content": "示例正文内容", "title": "示例"},
        headers=auth,
    )
    assert good.status_code == 200
    assert good.json()["sourceUri"] == "https://example.com/article"
    assert good.json()["sourceType"] == "web"


def test_empty_content_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    for path, payload in (
        ("/api/v1/knowledge-items/import/snippet", {"content": "   "}),
        ("/api/v1/knowledge-items/import/file", {"content": "", "sourceType": "markdown"}),
    ):
        response = client.post(path, json=payload, headers=auth)
        assert response.status_code == 400, path
        assert response.json()["code"] == "BAD_REQUEST"


def test_list_filters_pagination_and_ordering(client: TestClient, auth: dict[str, str]) -> None:
    for index in range(5):
        import_snippet(client, auth, f"第 {index} 条资料内容，用于分页与筛选验证。", f"资料 {index}")

    page = client.get(
        "/api/v1/knowledge-items", params={"status": "inbox", "page": 1, "pageSize": 2}, headers=auth
    )
    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 5
    assert body["pageSize"] == 2
    assert len(body["items"]) == 2

    ready = client.get(
        "/api/v1/knowledge-items", params={"status": "ready", "page": 1, "pageSize": 20}, headers=auth
    )
    assert ready.json()["total"] == 0

    multiple = client.get(
        "/api/v1/knowledge-items",
        params=[("status", "inbox"), ("status", "ready"), ("page", 1), ("pageSize", 20)],
        headers=auth,
    )
    assert multiple.json()["total"] == 5


def test_invalid_pagination_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get(
        "/api/v1/knowledge-items", params={"page": 0}, headers=auth
    ).status_code == 400
    assert client.get(
        "/api/v1/knowledge-items", params={"pageSize": 5000}, headers=auth
    ).status_code == 400
    assert client.get(
        "/api/v1/knowledge-items", params={"status": "nonsense"}, headers=auth
    ).status_code == 400


def test_search_matches_title_summary_and_content(client: TestClient, auth: dict[str, str]) -> None:
    import_snippet(client, auth, SNIPPET_TEXT, "FastAPI 笔记")
    import_snippet(client, auth, "完全无关的园艺笔记，记录薄荷与罗勒的种植。", "园艺笔记")

    hit = client.get(
        "/api/v1/knowledge-items/search", params={"q": "FastAPI"}, headers=auth
    )
    assert hit.status_code == 200
    assert hit.json()["total"] == 1
    assert hit.json()["items"][0]["title"] == "FastAPI 笔记"

    miss = client.get(
        "/api/v1/knowledge-items/search", params={"q": "不存在的关键词xyz"}, headers=auth
    )
    assert miss.json()["total"] == 0


def test_detail_update_and_tag_flow(client: TestClient, auth: dict[str, str]) -> None:
    item = import_snippet(client, auth, SNIPPET_TEXT, "待编辑")
    item_id = item["id"]

    updated = client.put(
        f"/api/v1/knowledge-items/{item_id}",
        json={"title": "已编辑标题", "summary": "人工摘要", "tags": ["python", "framework"]},
        headers=auth,
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["title"] == "已编辑标题"
    assert body["summary"] == "人工摘要"
    assert {tag["name"] for tag in body["tags"]} == {"python", "framework"}

    detail = client.get(f"/api/v1/knowledge-items/{item_id}", headers=auth)
    assert detail.json()["title"] == "已编辑标题"

    tags = client.get("/api/v1/tags", headers=auth)
    assert tags.status_code == 200
    counts = {entry["name"]: entry["count"] for entry in tags.json()}
    assert counts == {"python": 1, "framework": 1}

    by_tag = client.get(
        "/api/v1/knowledge-items", params={"tag": "python", "page": 1, "pageSize": 20}, headers=auth
    )
    assert by_tag.json()["total"] == 1


def test_create_tag_and_conflict(client: TestClient, auth: dict[str, str]) -> None:
    created = client.post("/api/v1/tags", json={"name": "深度阅读", "color": "#336699"}, headers=auth)
    assert created.status_code == 200
    assert created.json()["name"] == "深度阅读"

    duplicate = client.post("/api/v1/tags", json={"name": "深度阅读"}, headers=auth)
    assert duplicate.status_code == 400


def test_archive_and_restore(client: TestClient, auth: dict[str, str]) -> None:
    item = import_snippet(client, auth, SNIPPET_TEXT, "归档测试")
    item_id = item["id"]

    archived = client.post(f"/api/v1/knowledge-items/{item_id}/archive", headers=auth)
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    assert archived.json()["archivedAt"]

    archived_list = client.get(
        "/api/v1/knowledge-items",
        params={"status": "archived", "page": 1, "pageSize": 20},
        headers=auth,
    )
    assert archived_list.json()["total"] == 1

    restored = client.post(f"/api/v1/knowledge-items/{item_id}/restore", headers=auth)
    assert restored.status_code == 200
    # No summary yet, so the item returns to the inbox rather than "ready".
    assert restored.json()["status"] == "inbox"
    assert restored.json()["archivedAt"] is None


def test_unknown_and_malformed_ids_return_404(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/api/v1/knowledge-items/not-a-uuid", headers=auth).status_code == 404
    assert client.get(
        "/api/v1/knowledge-items/11111111-2222-3333-4444-555555555555", headers=auth
    ).status_code == 404


def test_cross_user_access_is_isolated(
    client: TestClient, auth: dict[str, str], second_auth: dict[str, str]
) -> None:
    item = import_snippet(client, auth, SNIPPET_TEXT, "私密资料")
    item_id = item["id"]

    assert client.get(f"/api/v1/knowledge-items/{item_id}", headers=second_auth).status_code == 404
    assert (
        client.put(
            f"/api/v1/knowledge-items/{item_id}", json={"title": "越权"}, headers=second_auth
        ).status_code
        == 404
    )
    assert (
        client.post(f"/api/v1/knowledge-items/{item_id}/archive", headers=second_auth).status_code
        == 404
    )
    assert client.get("/api/v1/knowledge-items", headers=second_auth).json()["total"] == 0


def test_dashboard_and_storage_summary(client: TestClient, auth: dict[str, str]) -> None:
    import_snippet(client, auth, SNIPPET_TEXT, "看板一")
    archived = import_snippet(client, auth, "另一条用于归档的内容。", "看板二")
    client.post(f"/api/v1/knowledge-items/{archived['id']}/archive", headers=auth)

    dashboard = client.get("/api/v1/dashboard/summary", headers=auth)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["totalItems"] == 2
    assert body["inboxItems"] == 1
    assert body["archivedItems"] == 1
    assert len(body["recentItems"]) == 1
    assert body["review"]["dueCount"] == 0

    storage = client.get("/api/v1/settings/storage", headers=auth)
    assert storage.status_code == 200
    stored = storage.json()
    assert stored["totalItems"] == 2
    assert stored["archivedItems"] == 1
    assert stored["totalModelSources"] == 0


def test_ingestion_jobs_are_recorded_and_scoped(client: TestClient, auth: dict[str, str]) -> None:
    item = import_snippet(client, auth, SNIPPET_TEXT, "任务流水")

    jobs = client.get(
        "/api/v1/ingestion-jobs", params={"knowledgeItemId": item["id"], "limit": 20}, headers=auth
    )
    assert jobs.status_code == 200
    body = jobs.json()
    assert len(body) >= 1
    assert body[0]["jobType"] == "import"
    assert body[0]["status"] == "succeeded"
    assert body[0]["knowledgeItemId"] == item["id"]

    missing = client.get("/api/v1/ingestion-jobs", headers=auth)
    assert missing.status_code == 400

    assert client.get(
        f"/api/v1/ingestion-jobs/{body[0]['id']}", headers=auth
    ).status_code == 200
    assert client.get(
        "/api/v1/ingestion-jobs/11111111-2222-3333-4444-555555555555", headers=auth
    ).status_code == 404


def test_source_uri_drops_absolute_paths(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/knowledge-items/import/file",
        json={
            "content": "本地文件内容，用于验证路径脱敏。",
            "sourceType": "markdown",
            "sourceUri": "/Users/someone/Documents/secret/note.md",
        },
        headers=auth,
    )
    assert response.status_code == 200
    assert response.json()["sourceUri"] is None

    relative = client.post(
        "/api/v1/knowledge-items/import/file",
        json={"content": "另一段相对路径内容。", "sourceType": "markdown", "sourceUri": "notes/x.md"},
        headers=auth,
    )
    assert relative.json()["sourceUri"] == "notes/x.md"
