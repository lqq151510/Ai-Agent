"""Optional AI organisation with a deterministic local degradation path.

Guarantees:
* A missing or broken model source never blocks import, edit, search, archive,
  review or backup.
* Every organised item leaves an auditable ingestion job.
* Failure messages are redacted and never contain credentials.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import NoReturn

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from knowledge_desk.application import knowledge_service as knowledge
from knowledge_desk.application import model_source_service as sources
from knowledge_desk.application.text_utils import heuristic_organize
from knowledge_desk.config import Settings
from knowledge_desk.domain.enums import (
    IngestionJobStatus,
    IngestionJobType,
    KnowledgeStatus,
    OrganizeMode,
    OrganizeOutcome,
)
from knowledge_desk.domain.models import KnowledgeItem, User, UserPreference, now_utc
from knowledge_desk.errors import ModelUnavailableError
from knowledge_desk.infrastructure.crypto import SecretCipher
from knowledge_desk.infrastructure.llm import parse_json_object
from knowledge_desk.infrastructure.redaction import redact_max

MAX_PROMPT_CHARS = 8_000
DEFAULT_BATCH_LIMIT = 20
MAX_BATCH_LIMIT = 50

ORGANIZE_SYSTEM_PROMPT = (
    "你是本机知识工作台的内容整理助手。请阅读用户提供的资料，"
    "输出严格的 JSON 对象，且只输出 JSON，不要任何解释或代码块标记。"
    '字段定义：{"summary": "不超过 120 字的中文摘要", '
    '"tags": ["3 到 5 个简短标签"], "cleanedContent": "清理后的正文，保留要点，去掉导航与重复内容"}'
)


@dataclass(frozen=True)
class OrganizeOutcomeRecord:
    item_id: str
    outcome: OrganizeOutcome
    status: IngestionJobStatus
    message: str | None = None


def should_auto_organize(session: Session, user_id: str) -> bool:
    preferences = session.get(UserPreference, user_id)
    return preferences is not None and preferences.organize_mode is OrganizeMode.AUTO


def _build_user_prompt(item: KnowledgeItem) -> str:
    body = item.cleaned_content or item.raw_content or ""
    trimmed = body[:MAX_PROMPT_CHARS]
    return f"标题：{item.title}\n\n正文：\n{trimmed}"


def _extract_draft(payload: dict) -> tuple[str | None, list[str], str | None]:
    summary = payload.get("summary") or payload.get("abstract")
    tags = payload.get("tags") or payload.get("keywords") or []
    cleaned = payload.get("cleanedContent") or payload.get("cleaned_content") or payload.get("content")
    if not isinstance(tags, list):
        tags = []
    resolved_tags = [str(tag).strip() for tag in tags if str(tag).strip()][:5]
    resolved_summary = str(summary).strip() if summary else None
    resolved_cleaned = str(cleaned).strip() if cleaned else None
    return resolved_summary, resolved_tags, resolved_cleaned


def _apply(
    session: Session,
    user_id: str,
    item: KnowledgeItem,
    *,
    cleaned: str,
    summary: str,
    tags: list[str],
) -> None:
    item.cleaned_content = cleaned
    item.summary = summary
    if tags:
        knowledge.set_item_tags(session, user_id, item, tags)
    item.status = KnowledgeStatus.READY
    item.updated_at = now_utc()
    session.add(item)
    session.commit()


def _mark_failed(
    session: Session, item: KnowledgeItem, job, message: str
) -> NoReturn:
    """Record the failure, then surface it as a normal API error.

    The failed job and (when the item has nothing worth keeping) the failed item
    status are committed first, so the desktop can show the item in the failed
    bucket and retry it later.
    """

    knowledge.finish_job(
        session,
        job,
        status=IngestionJobStatus.FAILED,
        error_message=redact_max(message),
    )
    if not (item.summary or "").strip():
        item.status = KnowledgeStatus.FAILED
        item.updated_at = now_utc()
        session.add(item)
        session.commit()
    raise ModelUnavailableError(message)


def organize_item(
    session: Session,
    settings: Settings,
    cipher: SecretCipher,
    user: User,
    item: KnowledgeItem,
    *,
    job_type: IngestionJobType = IngestionJobType.ORGANIZE,
) -> OrganizeOutcomeRecord:
    job = knowledge.start_job(
        session, user_id=user.id, item_id=item.id, job_type=job_type
    )

    source = sources.resolve_source(session, user.id, purpose=sources.PURPOSE_SUMMARY)

    if source is None:
        if settings.organize_no_model_policy == "fail":
            return _mark_failed(session, item, job, "尚未配置可用的模型源，无法进行 AI 整理")
        draft = heuristic_organize(item.title, item.raw_content or "")
        _apply(
            session,
            user.id,
            item,
            cleaned=draft.cleaned_content,
            summary=draft.summary,
            tags=draft.tags,
        )
        knowledge.finish_job(
            session,
            job,
            status=IngestionJobStatus.SUCCEEDED,
            note=OrganizeOutcome.LOCAL_HEURISTIC.value,
        )
        return OrganizeOutcomeRecord(
            item_id=item.id,
            outcome=OrganizeOutcome.LOCAL_HEURISTIC,
            status=IngestionJobStatus.SUCCEEDED,
        )

    try:
        client = sources.build_client(cipher, source, timeout_seconds=settings.llm_timeout_seconds)
        completion = client.complete(
            system_prompt=ORGANIZE_SYSTEM_PROMPT,
            user_prompt=_build_user_prompt(item),
        )
    except ModelUnavailableError as exc:
        return _mark_failed(session, item, job, str(exc))

    payload = parse_json_object(completion.text)
    if payload is None:
        # The provider answered but the payload was not JSON: keep the prose as
        # the summary rather than discarding a usable response.
        summary = completion.text.strip()[:400]
        if not summary:
            return _mark_failed(session, item, job, "模型返回内容为空")
        _apply(
            session,
            user.id,
            item,
            cleaned=item.cleaned_content or item.raw_content,
            summary=summary,
            tags=[],
        )
        knowledge.finish_job(
            session, job, status=IngestionJobStatus.SUCCEEDED, note="model-plain-text"
        )
        return OrganizeOutcomeRecord(
            item_id=item.id,
            outcome=OrganizeOutcome.MODEL,
            status=IngestionJobStatus.SUCCEEDED,
        )

    summary, tags, cleaned = _extract_draft(payload)
    if not summary:
        return _mark_failed(session, item, job, "模型没有返回摘要内容")

    _apply(
        session,
        user.id,
        item,
        cleaned=cleaned or item.cleaned_content or item.raw_content,
        summary=summary[:400],
        tags=tags,
    )
    knowledge.finish_job(
        session, job, status=IngestionJobStatus.SUCCEEDED, note=OrganizeOutcome.MODEL.value
    )
    return OrganizeOutcomeRecord(
        item_id=item.id, outcome=OrganizeOutcome.MODEL, status=IngestionJobStatus.SUCCEEDED
    )


def organize_batch(
    session: Session,
    settings: Settings,
    cipher: SecretCipher,
    user: User,
    *,
    limit: int = DEFAULT_BATCH_LIMIT,
    include_failed: bool = True,
) -> dict:
    resolved_limit = max(1, min(MAX_BATCH_LIMIT, int(limit or DEFAULT_BATCH_LIMIT)))
    statuses = [KnowledgeStatus.INBOX]
    if include_failed:
        statuses.append(KnowledgeStatus.FAILED)

    items = (
        session.execute(
            select(KnowledgeItem)
            .where(KnowledgeItem.user_id == user.id, KnowledgeItem.status.in_(statuses))
            .order_by(KnowledgeItem.created_at.asc())
            .limit(resolved_limit)
        )
        .scalars()
        .all()
    )

    succeeded = 0
    failed = 0
    for item in items:
        try:
            record = organize_item(session, settings, cipher, user, item)
        except ModelUnavailableError:
            failed += 1
            continue
        if record.status is IngestionJobStatus.SUCCEEDED:
            succeeded += 1
        else:
            failed += 1

    return {"total": len(items), "succeeded": succeeded, "failed": failed}


def reprocess_item(
    session: Session,
    settings: Settings,
    cipher: SecretCipher,
    user: User,
    item_id: str,
) -> KnowledgeItem:
    item = knowledge.get_item(session, user.id, item_id)
    organize_item(
        session, settings, cipher, user, item, job_type=IngestionJobType.REPROCESS
    )
    session.refresh(item)
    return item


def run_background_organize(
    session_factory: sessionmaker[Session],
    settings: Settings,
    cipher: SecretCipher,
    *,
    user_id: str,
    item_id: str,
) -> None:
    """Auto-organise an imported item without ever surfacing a failure.

    Called after an import when the user preference is ``auto``. Any failure is
    captured on the ingestion job and the item remains importable.
    """

    session = session_factory()
    try:
        item = session.get(KnowledgeItem, item_id)
        user = session.get(User, user_id)
        if item is None or user is None:
            return
        try:
            organize_item(session, settings, cipher, user, item)
        except ModelUnavailableError:
            session.rollback()
        except Exception:  # noqa: BLE001 - background work must never propagate
            session.rollback()
    finally:
        session.close()
