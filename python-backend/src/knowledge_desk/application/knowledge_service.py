"""Knowledge item, tag and ingestion-job application services."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from knowledge_desk.application.text_utils import (
    MAX_TITLE_LENGTH,
    count_words,
    detect_language,
    normalize_text,
)
from knowledge_desk.domain.enums import (
    IMPORTABLE_SOURCE_TYPES,
    IngestionJobStatus,
    IngestionJobType,
    KnowledgeStatus,
    SourceType,
)
from knowledge_desk.domain.models import (
    IngestionJob,
    KnowledgeItem,
    KnowledgeItemTag,
    ModelSource,
    ReviewState,
    SourceAsset,
    Tag,
    User,
    now_utc,
)
from knowledge_desk.errors import BadRequestError, NotFoundError

MAX_PAGE_SIZE = 100
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
RECENT_ITEM_LIMIT = 6
TOP_TAG_LIMIT = 8
MAX_TAG_NAME_LENGTH = 60
MAX_TAGS_PER_ITEM = 20


@dataclass(frozen=True)
class Page[T]:
    items: Sequence[T]
    total: int
    page: int
    page_size: int


def parse_item_id(item_id: str) -> str:
    try:
        return str(uuid.UUID(str(item_id)))
    except (ValueError, AttributeError, TypeError) as exc:
        raise NotFoundError("知识条目不存在") from exc


def parse_status(value: str) -> KnowledgeStatus:
    try:
        return KnowledgeStatus(value.strip().lower())
    except (ValueError, AttributeError) as exc:
        raise BadRequestError("status 参数不合法") from exc


def parse_source_type(value: str) -> SourceType:
    try:
        parsed = SourceType(value.strip().lower())
    except (ValueError, AttributeError) as exc:
        raise BadRequestError("sourceType 参数不合法") from exc
    if parsed not in IMPORTABLE_SOURCE_TYPES:
        raise BadRequestError("sourceType 参数不合法")
    return parsed


def parse_datetime(value: str | None, field: str) -> datetime | None:
    if value is None or not str(value).strip():
        return None
    raw = str(value).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        try:
            parsed = datetime.strptime(raw[:10], "%Y-%m-%d")
        except ValueError as exc:
            raise BadRequestError(f"{field} 时间格式不合法") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_page(page: int | None, page_size: int | None) -> tuple[int, int]:
    resolved_page = DEFAULT_PAGE if page is None else int(page)
    resolved_size = DEFAULT_PAGE_SIZE if page_size is None else int(page_size)
    if resolved_page < 1:
        raise BadRequestError("page 必须从 1 开始")
    if resolved_size < 1 or resolved_size > MAX_PAGE_SIZE:
        raise BadRequestError(f"pageSize 必须在 1 到 {MAX_PAGE_SIZE} 之间")
    return resolved_page, resolved_size


# --------------------------------------------------------------------------- #
# Knowledge items
# --------------------------------------------------------------------------- #


def get_item(session: Session, user_id: str, item_id: str) -> KnowledgeItem:
    resolved_id = parse_item_id(item_id)
    item = session.execute(
        select(KnowledgeItem).where(
            KnowledgeItem.id == resolved_id, KnowledgeItem.user_id == user_id
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFoundError("知识条目不存在")
    return item


def _apply_filters(
    stmt: Select,
    *,
    user_id: str,
    statuses: Iterable[str] | None = None,
    tag: str | None = None,
    source_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> Select:
    stmt = stmt.where(KnowledgeItem.user_id == user_id)
    resolved_statuses = [parse_status(value) for value in (statuses or [])]
    if resolved_statuses:
        stmt = stmt.where(KnowledgeItem.status.in_(resolved_statuses))
    if source_type:
        stmt = stmt.where(KnowledgeItem.source_type == parse_source_type(source_type))
    if tag and tag.strip():
        stmt = stmt.where(KnowledgeItem.tags.any(Tag.name == tag.strip()))
    started = parse_datetime(date_from, "from")
    if started is not None:
        stmt = stmt.where(KnowledgeItem.created_at >= started)
    ended = parse_datetime(date_to, "to")
    if ended is not None:
        stmt = stmt.where(KnowledgeItem.created_at <= ended)
    return stmt


def _paginate(session: Session, stmt: Select, page: int, page_size: int) -> Page[KnowledgeItem]:
    total = session.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()
    rows = (
        session.execute(
            stmt.order_by(KnowledgeItem.updated_at.desc(), KnowledgeItem.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        .scalars()
        .all()
    )
    return Page(items=rows, total=int(total), page=page, page_size=page_size)


def list_items(
    session: Session,
    user_id: str,
    *,
    statuses: Sequence[str] | None = None,
    tag: str | None = None,
    source_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> Page[KnowledgeItem]:
    resolved_page, resolved_size = normalize_page(page, page_size)
    stmt = _apply_filters(
        select(KnowledgeItem),
        user_id=user_id,
        statuses=statuses,
        tag=tag,
        source_type=source_type,
        date_from=date_from,
        date_to=date_to,
    )
    return _paginate(session, stmt, resolved_page, resolved_size)


def search_items(
    session: Session,
    user_id: str,
    *,
    query: str | None = None,
    status: str | None = None,
    tag: str | None = None,
    source_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> Page[KnowledgeItem]:
    resolved_page, resolved_size = normalize_page(page, page_size)
    stmt = _apply_filters(
        select(KnowledgeItem),
        user_id=user_id,
        statuses=[status] if status else None,
        tag=tag,
        source_type=source_type,
        date_from=date_from,
        date_to=date_to,
    )
    if query and query.strip():
        needle = f"%{query.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(KnowledgeItem.title).like(needle),
                func.lower(func.coalesce(KnowledgeItem.summary, "")).like(needle),
                func.lower(func.coalesce(KnowledgeItem.cleaned_content, "")).like(needle),
                func.lower(KnowledgeItem.raw_content).like(needle),
                KnowledgeItem.tags.any(func.lower(Tag.name).like(needle)),
            )
        )
    return _paginate(session, stmt, resolved_page, resolved_size)


def create_item(
    session: Session,
    *,
    user_id: str,
    source_type: SourceType,
    title: str,
    raw_content: str,
    source_uri: str | None = None,
    status: KnowledgeStatus = KnowledgeStatus.INBOX,
    content_hash: str | None = None,
    language: str | None = None,
) -> KnowledgeItem:
    normalized = normalize_text(raw_content)
    item = KnowledgeItem(
        user_id=user_id,
        source_type=source_type,
        title=title.strip()[:MAX_TITLE_LENGTH] or "未命名资料",
        source_uri=(source_uri or "").strip() or None,
        raw_content=normalized,
        status=status,
        content_hash=content_hash,
        language=language or detect_language(normalized),
        word_count=count_words(normalized),
    )
    session.add(item)
    session.flush()
    session.commit()
    return item


def update_item(
    session: Session,
    user_id: str,
    item_id: str,
    *,
    title: str | None = None,
    summary: str | None = None,
    tags: Sequence[str] | None = None,
) -> KnowledgeItem:
    item = get_item(session, user_id, item_id)
    if title is not None:
        cleaned = title.strip()
        if cleaned:
            item.title = cleaned[:MAX_TITLE_LENGTH]
    if summary is not None:
        item.summary = summary.strip() or None
    if tags is not None:
        set_item_tags(session, user_id, item, tags)
    item.updated_at = now_utc()
    session.add(item)
    session.commit()
    return item


def archive_item(session: Session, user_id: str, item_id: str) -> KnowledgeItem:
    item = get_item(session, user_id, item_id)
    item.status = KnowledgeStatus.ARCHIVED
    item.archived_at = now_utc()
    item.updated_at = now_utc()
    session.add(item)
    session.commit()
    return item


def restore_item(session: Session, user_id: str, item_id: str) -> KnowledgeItem:
    item = get_item(session, user_id, item_id)
    item.status = KnowledgeStatus.READY if (item.summary or "").strip() else KnowledgeStatus.INBOX
    item.archived_at = None
    item.updated_at = now_utc()
    session.add(item)
    session.commit()
    return item


def delete_item(session: Session, user_id: str, item_id: str) -> None:
    item = get_item(session, user_id, item_id)
    session.delete(item)
    session.commit()


# --------------------------------------------------------------------------- #
# Tags
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class TagUsage:
    id: str
    name: str
    color: str | None
    count: int


def list_tags(session: Session, user_id: str, *, limit: int | None = None) -> list[TagUsage]:
    stmt = (
        select(
            Tag.id,
            Tag.name,
            Tag.color,
            func.count(KnowledgeItemTag.knowledge_item_id).label("usage_count"),
        )
        .outerjoin(KnowledgeItemTag, KnowledgeItemTag.tag_id == Tag.id)
        .where(Tag.user_id == user_id)
        .group_by(Tag.id, Tag.name, Tag.color)
        .order_by(func.count(KnowledgeItemTag.knowledge_item_id).desc(), Tag.name.asc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return [
        TagUsage(id=row.id, name=row.name, color=row.color, count=int(row.usage_count))
        for row in session.execute(stmt).all()
    ]


def resolve_tags(session: Session, user_id: str, names: Sequence[str]) -> list[Tag]:
    resolved: list[Tag] = []
    seen: set[str] = set()
    for raw in names:
        name = (raw or "").strip()
        if not name or len(name) > MAX_TAG_NAME_LENGTH:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        existing = session.execute(
            select(Tag).where(Tag.user_id == user_id, func.lower(Tag.name) == key)
        ).scalar_one_or_none()
        if existing is None:
            existing = Tag(user_id=user_id, name=name)
            session.add(existing)
            session.flush()
        resolved.append(existing)
        if len(resolved) >= MAX_TAGS_PER_ITEM:
            break
    return resolved


def set_item_tags(session: Session, user_id: str, item: KnowledgeItem, names: Sequence[str]) -> None:
    item.tags = resolve_tags(session, user_id, names)
    session.add(item)


def create_tag(session: Session, user_id: str, name: str, color: str | None = None) -> Tag:
    cleaned = (name or "").strip()
    if not cleaned or len(cleaned) > MAX_TAG_NAME_LENGTH:
        raise BadRequestError("标签名称不合法")
    existing = session.execute(
        select(Tag).where(Tag.user_id == user_id, func.lower(Tag.name) == cleaned.lower())
    ).scalar_one_or_none()
    if existing is not None:
        raise BadRequestError("标签已存在")
    tag = Tag(user_id=user_id, name=cleaned, color=(color or "").strip() or None)
    session.add(tag)
    session.commit()
    return tag


# --------------------------------------------------------------------------- #
# Ingestion jobs
# --------------------------------------------------------------------------- #


def start_job(
    session: Session,
    *,
    user_id: str,
    item_id: str,
    job_type: IngestionJobType,
) -> IngestionJob:
    job = IngestionJob(
        user_id=user_id,
        knowledge_item_id=item_id,
        job_type=job_type,
        status=IngestionJobStatus.RUNNING,
        started_at=now_utc(),
    )
    session.add(job)
    session.commit()
    return job


def finish_job(
    session: Session,
    job: IngestionJob,
    *,
    status: IngestionJobStatus,
    error_message: str | None = None,
    note: str | None = None,
) -> IngestionJob:
    job.status = status
    job.error_message = error_message
    job.note = note
    job.finished_at = now_utc()
    session.add(job)
    session.commit()
    return job


def list_jobs(session: Session, user_id: str, *, item_id: str, limit: int = 20) -> list[IngestionJob]:
    resolved_id = parse_item_id(item_id)
    resolved_limit = max(1, min(100, int(limit)))
    rows = (
        session.execute(
            select(IngestionJob)
            .where(IngestionJob.user_id == user_id, IngestionJob.knowledge_item_id == resolved_id)
            .order_by(IngestionJob.created_at.desc())
            .limit(resolved_limit)
        )
        .scalars()
        .all()
    )
    return list(rows)


def get_job(session: Session, user_id: str, job_id: str) -> IngestionJob:
    resolved_id = parse_item_id(job_id)
    job = session.execute(
        select(IngestionJob).where(IngestionJob.id == resolved_id, IngestionJob.user_id == user_id)
    ).scalar_one_or_none()
    if job is None:
        raise NotFoundError("任务不存在")
    return job


# --------------------------------------------------------------------------- #
# Aggregates
# --------------------------------------------------------------------------- #


def _status_counts(session: Session, user_id: str) -> dict[str, int]:
    rows = session.execute(
        select(KnowledgeItem.status, func.count(KnowledgeItem.id))
        .where(KnowledgeItem.user_id == user_id)
        .group_by(KnowledgeItem.status)
    ).all()
    counts = {status.value: 0 for status in KnowledgeStatus}
    for status, value in rows:
        key = status.value if isinstance(status, KnowledgeStatus) else str(status)
        counts[key] = int(value)
    return counts


def dashboard_summary(session: Session, user_id: str) -> dict:
    counts = _status_counts(session, user_id)
    recent = (
        session.execute(
            select(KnowledgeItem)
            .where(
                KnowledgeItem.user_id == user_id,
                KnowledgeItem.status != KnowledgeStatus.ARCHIVED,
            )
            .order_by(KnowledgeItem.updated_at.desc())
            .limit(RECENT_ITEM_LIMIT)
        )
        .scalars()
        .all()
    )
    top_tags = list_tags(session, user_id, limit=TOP_TAG_LIMIT)
    return {
        "totalItems": sum(counts.values()),
        "inboxItems": counts.get(KnowledgeStatus.INBOX.value, 0),
        "readyItems": counts.get(KnowledgeStatus.READY.value, 0),
        "failedItems": counts.get(KnowledgeStatus.FAILED.value, 0),
        "processingItems": counts.get(KnowledgeStatus.PROCESSING.value, 0),
        "archivedItems": counts.get(KnowledgeStatus.ARCHIVED.value, 0),
        "recentItems": list(recent),
        "topTags": top_tags,
    }


def storage_summary(session: Session, user_id: str) -> dict:
    counts = _status_counts(session, user_id)
    total_tags = session.execute(
        select(func.count(Tag.id)).where(Tag.user_id == user_id)
    ).scalar_one()
    total_sources = session.execute(
        select(func.count(ModelSource.id)).where(ModelSource.user_id == user_id)
    ).scalar_one()
    total_assets = session.execute(
        select(func.count(SourceAsset.id)).where(SourceAsset.user_id == user_id)
    ).scalar_one()
    total_reviews = session.execute(
        select(func.count(ReviewState.id)).where(ReviewState.user_id == user_id)
    ).scalar_one()
    return {
        "totalItems": sum(counts.values()),
        "inboxItems": counts.get(KnowledgeStatus.INBOX.value, 0),
        "readyItems": counts.get(KnowledgeStatus.READY.value, 0),
        "failedItems": counts.get(KnowledgeStatus.FAILED.value, 0),
        "processingItems": counts.get(KnowledgeStatus.PROCESSING.value, 0),
        "archivedItems": counts.get(KnowledgeStatus.ARCHIVED.value, 0),
        "totalTags": int(total_tags),
        "totalModelSources": int(total_sources),
        "totalSourceAssets": int(total_assets),
        "totalReviewStates": int(total_reviews),
    }


def user_display_name(user: User) -> str:
    return (user.display_name or "").strip() or (user.email.split("@")[0] if user.email else "")
