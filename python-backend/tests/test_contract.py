"""Contract inventory: the MVP surface the desktop renderer depends on."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

MVP_ROUTES: set[tuple[str, str]] = {
    # system
    ("GET", "/api/v1/system/health/ready"),
    # auth
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/auth/me"),
    # dashboard
    ("GET", "/api/v1/dashboard/summary"),
    # knowledge items
    ("GET", "/api/v1/knowledge-items"),
    ("GET", "/api/v1/knowledge-items/search"),
    ("GET", "/api/v1/knowledge-items/{item_id}"),
    ("PUT", "/api/v1/knowledge-items/{item_id}"),
    ("POST", "/api/v1/knowledge-items/import/web"),
    ("POST", "/api/v1/knowledge-items/import/snippet"),
    ("POST", "/api/v1/knowledge-items/import/file"),
    ("POST", "/api/v1/knowledge-items/import/upload"),
    ("POST", "/api/v1/knowledge-items/import/preflight"),
    ("POST", "/api/v1/knowledge-items/organize-batch"),
    ("POST", "/api/v1/knowledge-items/{item_id}/organize"),
    ("POST", "/api/v1/knowledge-items/{item_id}/reprocess"),
    ("POST", "/api/v1/knowledge-items/{item_id}/archive"),
    ("POST", "/api/v1/knowledge-items/{item_id}/restore"),
    # tags
    ("GET", "/api/v1/tags"),
    ("POST", "/api/v1/tags"),
    # ingestion jobs
    ("GET", "/api/v1/ingestion-jobs"),
    ("GET", "/api/v1/ingestion-jobs/{job_id}"),
    # model sources
    ("GET", "/api/v1/model-sources"),
    ("POST", "/api/v1/model-sources"),
    ("PUT", "/api/v1/model-sources/{source_id}"),
    ("DELETE", "/api/v1/model-sources/{source_id}"),
    ("POST", "/api/v1/model-sources/{source_id}/enable"),
    ("POST", "/api/v1/model-sources/{source_id}/disable"),
    ("POST", "/api/v1/model-sources/{source_id}/set-default"),
    ("POST", "/api/v1/model-sources/{source_id}/test"),
    # settings
    ("GET", "/api/v1/settings/profile"),
    ("PUT", "/api/v1/settings/profile"),
    ("GET", "/api/v1/settings/storage"),
    ("GET", "/api/v1/settings/export"),
    ("POST", "/api/v1/settings/import"),
    # reviews
    ("GET", "/api/v1/knowledge-reviews/queue"),
    ("GET", "/api/v1/knowledge-reviews/summary"),
    ("POST", "/api/v1/knowledge-reviews/{item_id}/complete"),
}

OUT_OF_MVP_PREFIXES = (
    "/api/v1/agent",
    "/api/v1/sessions",
    "/api/v1/coach",
    "/api/v1/sentinel",
    "/api/v1/memory",
    "/api/v1/release-report",
)


def _iter_leaf_routes(routes):
    """Flatten FastAPI's lazily wrapped ``_IncludedRouter`` tree."""

    for route in routes:
        nested = getattr(route, "routes", None)
        if not nested:
            original = getattr(route, "original_router", None)
            nested = getattr(original, "routes", None) if original is not None else None
        if nested:
            yield from _iter_leaf_routes(nested)
            continue
        yield route


def _route_inventory(app) -> set[tuple[str, str]]:
    inventory: set[tuple[str, str]] = set()
    for route in _iter_leaf_routes(app.routes):
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if not methods or not path:
            continue
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            inventory.add((method, path))
    return inventory


@pytest.mark.parametrize(("method", "path"), sorted(MVP_ROUTES))
def test_mvp_route_exists(method: str, path: str, app) -> None:
    assert (method, path) in _route_inventory(app), f"missing route: {method} {path}"


def test_out_of_scope_surfaces_are_absent(app) -> None:
    inventory = _route_inventory(app)
    for method, path in inventory:
        for prefix in OUT_OF_MVP_PREFIXES:
            assert not path.startswith(prefix), f"unexpected MVP route: {method} {path}"


def test_desktop_main_process_allowlist_is_covered(app) -> None:
    """Every prefix the Electron allowlist forwards must be served."""

    allowed_prefixes = (
        "/api/v1/dashboard",
        "/api/v1/knowledge-items",
        "/api/v1/tags",
        "/api/v1/model-sources",
        "/api/v1/settings",
        "/api/v1/knowledge-reviews",
        "/api/v1/ingestion-jobs",
    )
    inventory = _route_inventory(app)
    for prefix in allowed_prefixes:
        assert any(path.startswith(prefix) for _method, path in inventory), prefix


def test_error_envelope_is_uniform(client: TestClient, auth: dict[str, str]) -> None:
    responses = (
        client.get("/api/v1/knowledge-items"),  # 401
        client.get("/api/v1/knowledge-items", headers={**auth, "Authorization": "Bearer bad"}),
        client.get("/api/v1/knowledge-items", params={"page": 0}, headers=auth),  # 400
        client.get(
            "/api/v1/knowledge-items/11111111-2222-3333-4444-555555555555", headers=auth
        ),  # 404
        client.post("/api/v1/knowledge-items/import/snippet", json={}, headers=auth),  # 400
    )
    for response in responses:
        payload = response.json()
        assert isinstance(payload.get("message"), str) and payload["message"]
        assert isinstance(payload.get("code"), str) and payload["code"]
        assert response.headers["content-type"].startswith("application/json")


def test_wire_field_names_are_camel_case(client: TestClient, auth: dict[str, str]) -> None:
    item = client.post(
        "/api/v1/knowledge-items/import/snippet",
        json={"content": "用于校验字段命名的内容。", "title": "字段命名"},
        headers=auth,
    ).json()
    assert {"sourceType", "rawContent", "wordCount", "createdAt", "updatedAt"} <= set(item)
    assert not {"source_type", "raw_content", "word_count"} & set(item)

    page = client.get(
        "/api/v1/knowledge-items", params={"page": 1, "pageSize": 5}, headers=auth
    ).json()
    assert {"items", "total", "page", "pageSize"} == set(page)

    dashboard = client.get("/api/v1/dashboard/summary", headers=auth).json()
    assert {"totalItems", "inboxItems", "readyItems", "failedItems"} <= set(dashboard)

    profile = client.get("/api/v1/settings/profile", headers=auth).json()
    assert {"organizeMode", "privacyMode"} <= set(profile)

    review = client.get("/api/v1/knowledge-reviews/summary", headers=auth).json()
    assert set(review) == {"dueCount", "nextDueAt"}


def test_timestamps_are_iso8601_utc(client: TestClient, auth: dict[str, str]) -> None:
    item = client.post(
        "/api/v1/knowledge-items/import/snippet",
        json={"content": "时间格式校验内容。", "title": "时间"},
        headers=auth,
    ).json()
    for field in ("createdAt", "updatedAt"):
        value = item[field]
        assert value.endswith("Z") or "+00:00" in value or value.endswith("+00:00")

    ids = {item["id"], client.get("/api/v1/auth/me", headers=auth).json()["id"]}
    for value in ids:
        assert len(value) == 36 and value.count("-") == 4
