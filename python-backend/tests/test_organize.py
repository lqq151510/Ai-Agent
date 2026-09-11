"""Optional AI organisation: success, degradation and failure recording."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from knowledge_desk.domain.enums import IngestionJobStatus, IngestionJobType
from knowledge_desk.domain.models import IngestionJob, UserPreference
from knowledge_desk.infrastructure import llm
from tests.conftest import import_snippet

ARTICLE = (
    "FastAPI 是一个现代、快速的 Python Web 框架，基于 Starlette 与 Pydantic 构建。\n\n"
    "它通过类型注解自动生成请求校验与文档，并且原生支持 async/await 语法。\n\n"
    "在生产环境中，FastAPI 通常与 Uvicorn 或 Gunicorn 搭配部署。"
)


def _create_source(client: TestClient, auth: dict[str, str], *, name: str = "本地模型", key: str = "sk-test-abcd1234"):
    response = client.post(
        "/api/v1/model-sources",
        json={
            "providerType": "openai",
            "name": name,
            "baseUrl": "http://127.0.0.1:9/v1",
            "apiKey": key,
            "defaultModel": "test-model",
            "enabled": True,
            "isDefault": True,
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return response.json()


class _StubCompletion:
    def __init__(self, text: str) -> None:
        self.text = text
        self.model = "test-model"


def test_no_model_uses_local_heuristic(client: TestClient, auth: dict[str, str], session_factory) -> None:
    item = import_snippet(client, auth, ARTICLE, "FastAPI 概览")

    response = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["summary"]
    assert body["cleanedContent"]

    session = session_factory()
    try:
        jobs = session.execute(
            select(IngestionJob).where(IngestionJob.knowledge_item_id == item["id"])
        ).scalars().all()
    finally:
        session.close()

    organize_jobs = [job for job in jobs if job.job_type is IngestionJobType.ORGANIZE]
    assert organize_jobs
    assert organize_jobs[-1].status is IngestionJobStatus.SUCCEEDED
    assert organize_jobs[-1].note == "local_heuristic"


def test_organize_no_model_policy_fail(tmp_path, auth_factory) -> None:
    from knowledge_desk.config import Settings
    from knowledge_desk.main import create_app

    settings = Settings(
        data_dir=tmp_path / "strict",
        jwt_secret="strict-mode-jwt-secret-for-tests-only",
        db_encryption_key="strict-key",
        desktop_mode=True,
        log_level="WARNING",
        organize_no_model_policy="fail",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        auth = auth_factory(client)
        item = import_snippet(client, auth, ARTICLE, "严格模式")
        response = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
        assert response.status_code == 502
        assert response.json()["code"] == "MODEL_UNAVAILABLE"

        detail = client.get(f"/api/v1/knowledge-items/{item['id']}", headers=auth).json()
        assert detail["status"] == "failed"

        jobs = client.get(
            "/api/v1/ingestion-jobs",
            params={"knowledgeItemId": item["id"], "limit": 20},
            headers=auth,
        ).json()
        failed = [job for job in jobs if job["jobType"] == "organize" and job["status"] == "failed"]
        assert failed
        assert failed[0]["errorMessage"]


def test_model_failure_is_recorded_and_redacted(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _create_source(client, auth, key="sk-secret-key-should-never-appear-1234")
    item = import_snippet(client, auth, ARTICLE, "失败降级")

    def _boom(self, **_kwargs):
        from knowledge_desk.errors import ModelUnavailableError

        raise ModelUnavailableError("模型响应超时，请稍后重试或检查网络与代理设置")

    monkeypatch.setattr(llm.ChatClient, "complete", _boom)

    response = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
    assert response.status_code == 502
    payload = response.json()
    assert payload["code"] == "MODEL_UNAVAILABLE"
    assert "sk-secret" not in json.dumps(payload)
    assert "sk-secret" not in response.text

    detail = client.get(f"/api/v1/knowledge-items/{item['id']}", headers=auth).json()
    assert detail["status"] == "failed"

    jobs = client.get(
        "/api/v1/ingestion-jobs", params={"knowledgeItemId": item["id"], "limit": 20}, headers=auth
    ).json()
    failed = [job for job in jobs if job["status"] == "failed"]
    assert failed
    assert "sk-secret" not in json.dumps(jobs)

    # The item stays searchable and archivable despite the failure.
    assert client.get(
        "/api/v1/knowledge-items/search", params={"q": "FastAPI"}, headers=auth
    ).json()["total"] == 1
    assert client.post(
        f"/api/v1/knowledge-items/{item['id']}/archive", headers=auth
    ).status_code == 200


def test_model_success_applies_summary_and_tags(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _create_source(client, auth)
    item = import_snippet(client, auth, ARTICLE, "模型整理")

    def _ok(self, **_kwargs):
        return _StubCompletion(
            json.dumps(
                {
                    "summary": "FastAPI 是面向 Python 的现代 Web 框架。",
                    "tags": ["python", "web", "framework"],
                    "cleanedContent": "精简后的正文内容。",
                },
                ensure_ascii=False,
            )
        )

    monkeypatch.setattr(llm.ChatClient, "complete", _ok)

    response = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["summary"] == "FastAPI 是面向 Python 的现代 Web 框架。"
    assert body["cleanedContent"] == "精简后的正文内容。"
    assert {tag["name"] for tag in body["tags"]} == {"python", "web", "framework"}


def test_plain_text_model_answer_is_kept_as_summary(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _create_source(client, auth)
    item = import_snippet(client, auth, ARTICLE, "纯文本回答")

    monkeypatch.setattr(llm.ChatClient, "complete", lambda self, **_k: _StubCompletion("这不是 JSON 的摘要。"))

    response = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
    assert response.status_code == 200
    assert response.json()["summary"] == "这不是 JSON 的摘要。"


def test_empty_model_answer_fails_the_job(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _create_source(client, auth)
    item = import_snippet(client, auth, ARTICLE, "空回答")

    monkeypatch.setattr(llm.ChatClient, "complete", lambda self, **_k: _StubCompletion("   "))

    response = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
    assert response.status_code == 502


def test_reprocess_creates_reprocess_job(client: TestClient, auth: dict[str, str], session_factory) -> None:
    item = import_snippet(client, auth, ARTICLE, "重新整理")
    response = client.post(f"/api/v1/knowledge-items/{item['id']}/reprocess", headers=auth)
    assert response.status_code == 200
    assert response.json()["status"] == "ready"

    session = session_factory()
    try:
        job_types = {
            job.job_type
            for job in session.execute(
                select(IngestionJob).where(IngestionJob.knowledge_item_id == item["id"])
            ).scalars()
        }
    finally:
        session.close()
    assert IngestionJobType.REPROCESS in job_types


def test_batch_organize_covers_inbox_and_failed(client: TestClient, auth: dict[str, str]) -> None:
    for index in range(3):
        import_snippet(client, auth, f"{ARTICLE}\n第 {index} 段补充。", f"批量 {index}")

    response = client.post(
        "/api/v1/knowledge-items/organize-batch",
        params={"limit": 10, "includeFailed": True},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert body["succeeded"] == 3
    assert body["failed"] == 0
    assert body["totalCount"] == 3 and body["successCount"] == 3

    again = client.post(
        "/api/v1/knowledge-items/organize-batch", params={"limit": 10}, headers=auth
    )
    assert again.json()["total"] == 0


def test_auto_mode_organizes_on_import(
    client: TestClient, auth: dict[str, str], session_factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    update = client.put(
        "/api/v1/settings/profile", json={"organizeMode": "auto"}, headers=auth
    )
    assert update.status_code == 200
    assert update.json()["organizeMode"] == "auto"

    item = import_snippet(client, auth, ARTICLE, "自动整理")
    detail = client.get(f"/api/v1/knowledge-items/{item['id']}", headers=auth).json()
    assert detail["status"] == "ready"
    assert detail["summary"]

    session = session_factory()
    try:
        preference = session.get(UserPreference, client.get("/api/v1/auth/me", headers=auth).json()["id"])
        assert preference.organize_mode.value == "auto"
    finally:
        session.close()


def test_auto_mode_import_survives_model_failure(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _create_source(client, auth)
    client.put("/api/v1/settings/profile", json={"organizeMode": "auto"}, headers=auth)

    def _boom(self, **_kwargs):
        from knowledge_desk.errors import ModelUnavailableError

        raise ModelUnavailableError("模型源暂时不可用")

    monkeypatch.setattr(llm.ChatClient, "complete", _boom)

    item = import_snippet(client, auth, ARTICLE, "自动整理失败")
    # The import itself must still succeed and never surface the model failure.
    assert item["status"] in {"processing", "inbox", "failed"}

    detail = client.get(f"/api/v1/knowledge-items/{item['id']}", headers=auth).json()
    assert detail["title"] == "自动整理失败"
    assert client.get(
        "/api/v1/knowledge-items/search", params={"q": "自动整理失败"}, headers=auth
    ).json()["total"] == 1
