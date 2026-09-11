"""Import pipeline: web pages, snippets, picked files and uploaded documents."""

from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from knowledge_desk.application import knowledge_service as knowledge
from knowledge_desk.application.text_utils import content_hash, derive_title, normalize_text
from knowledge_desk.config import Settings
from knowledge_desk.domain.enums import (
    IngestionJobStatus,
    IngestionJobType,
    KnowledgeStatus,
    SourceAssetOrigin,
    SourceType,
    IMPORTABLE_SOURCE_TYPES,
)
from knowledge_desk.domain.models import KnowledgeItem, SourceAsset, User, new_uuid
from knowledge_desk.errors import (
    BadRequestError,
    DuplicateContentError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
)
from knowledge_desk.infrastructure.document_parser import (
    extension_of,
    is_supported_filename,
    mime_type_for,
    parse_document,
    source_type_for,
)
from knowledge_desk.infrastructure.redaction import redact_max

MAX_CONTENT_LENGTH = 5_000_000
ABSOLUTE_PATH_PATTERN = re.compile(r"^(?:[A-Za-z]:[\\/]|/|~)")
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)

# Source types whose content identity is treated as a file identity, so a
# byte-identical or text-identical re-import is a conflict rather than a
# legitimate second capture.
FILE_LIKE_SOURCE_TYPES = {
    SourceType.PDF,
    SourceType.DOCX,
    SourceType.PPTX,
    SourceType.MARKDOWN,
    SourceType.HTML,
    SourceType.TXT,
}


def sanitize_source_uri(value: str | None) -> str | None:
    """Keep user-facing references, drop absolute host paths."""

    if not value:
        return None
    candidate = value.strip()
    if not candidate or ABSOLUTE_PATH_PATTERN.match(candidate):
        return None
    return candidate[:2048]


def _validate_content(content: str | None) -> str:
    if content is None:
        raise BadRequestError("内容不能为空")
    normalized = content.strip()
    if not normalized:
        raise BadRequestError("内容不能为空")
    if len(content) > MAX_CONTENT_LENGTH:
        raise PayloadTooLargeError("导入内容超出大小上限")
    return content


def _existing_hash(session: Session, user_id: str, digest: str) -> KnowledgeItem | None:
    return session.execute(
        select(KnowledgeItem).where(
            KnowledgeItem.user_id == user_id, KnowledgeItem.content_hash == digest
        )
    ).scalars().first()


def _guard_duplicate(session: Session, user_id: str, digest: str, source_type: SourceType) -> None:
    if source_type not in FILE_LIKE_SOURCE_TYPES:
        return
    if _existing_hash(session, user_id, digest) is not None:
        raise DuplicateContentError()


def _record_import_job(
    session: Session,
    *,
    user_id: str,
    item_id: str,
    status: IngestionJobStatus,
    note: str | None = None,
    error_message: str | None = None,
) -> None:
    job = knowledge.start_job(
        session, user_id=user_id, item_id=item_id, job_type=IngestionJobType.IMPORT
    )
    knowledge.finish_job(
        session,
        job,
        status=status,
        note=note,
        error_message=redact_max(error_message),
    )


def import_web(
    session: Session,
    user: User,
    *,
    url: str | None,
    content: str | None,
    title: str | None = None,
) -> KnowledgeItem:
    if not url or not URL_PATTERN.match(url.strip()):
        raise BadRequestError("网页地址必须以 http:// 或 https:// 开头")
    payload = _validate_content(content)
    text = normalize_text(payload)
    item = knowledge.create_item(
        session,
        user_id=user.id,
        source_type=SourceType.WEB,
        title=derive_title(title, text, url.strip()),
        raw_content=text,
        source_uri=sanitize_source_uri(url),
    )
    _record_import_job(
        session, user_id=user.id, item_id=item.id, status=IngestionJobStatus.SUCCEEDED, note="web"
    )
    return item


def import_snippet(
    session: Session,
    user: User,
    *,
    content: str | None,
    title: str | None = None,
) -> KnowledgeItem:
    payload = _validate_content(content)
    text = normalize_text(payload)
    item = knowledge.create_item(
        session,
        user_id=user.id,
        source_type=SourceType.SNIPPET,
        title=derive_title(title, text, "手动片段"),
        raw_content=text,
    )
    _record_import_job(
        session, user_id=user.id, item_id=item.id, status=IngestionJobStatus.SUCCEEDED, note="snippet"
    )
    return item


def import_file_payload(
    session: Session,
    user: User,
    *,
    source_type: str | None,
    source_uri: str | None,
    content: str | None,
    title: str | None = None,
) -> KnowledgeItem:
    payload = _validate_content(content)
    resolved_type = knowledge.parse_source_type(source_type or SourceType.MARKDOWN.value)
    text = normalize_text(payload)
    digest = content_hash(text)
    _guard_duplicate(session, user.id, digest, resolved_type)

    item = knowledge.create_item(
        session,
        user_id=user.id,
        source_type=resolved_type,
        title=derive_title(title, text, "本地文件"),
        raw_content=text,
        source_uri=sanitize_source_uri(source_uri),
        content_hash=digest,
    )
    _record_import_job(
        session,
        user_id=user.id,
        item_id=item.id,
        status=IngestionJobStatus.SUCCEEDED,
        note=resolved_type.value,
    )
    return item


def _store_asset(
    settings: Settings,
    *,
    user_id: str,
    item_id: str,
    filename: str,
    data: bytes,
    digest: str,
) -> SourceAsset:
    """Persist the original document under the managed data directory.

    Only the path *relative* to the managed sources directory is recorded.
    """

    extension = extension_of(filename)
    target_dir = settings.sources_dir / user_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{new_uuid()}{extension}"
    target.write_bytes(data)
    return SourceAsset(
        user_id=user_id,
        knowledge_item_id=item_id,
        original_filename=Path(filename).name[:510],
        stored_relative_path=str(target.relative_to(settings.sources_dir)),
        mime_type=mime_type_for(filename),
        size_bytes=len(data),
        content_hash=digest,
        origin=SourceAssetOrigin.PICKER,
    )


def import_upload(
    session: Session,
    settings: Settings,
    user: User,
    *,
    filename: str,
    data: bytes,
    title: str | None = None,
) -> KnowledgeItem:
    if not data:
        raise BadRequestError("上传文件为空")
    if len(data) > settings.max_upload_bytes:
        raise PayloadTooLargeError(
            f"文件超出 {settings.max_upload_bytes // (1024 * 1024)}MB 上传上限"
        )
    if not is_supported_filename(filename):
        raise UnsupportedMediaTypeError("暂不支持该文件类型")

    digest = content_hash(data)
    resolved_type = source_type_for(filename)
    _guard_duplicate(session, user.id, digest, resolved_type)

    parsed = parse_document(filename, data)
    item = knowledge.create_item(
        session,
        user_id=user.id,
        source_type=parsed.source_type if parsed.source_type in IMPORTABLE_SOURCE_TYPES else resolved_type,
        title=derive_title(title or parsed.metadata.get("title"), parsed.text, Path(filename).stem),
        raw_content=parsed.text,
        source_uri=None,
        content_hash=digest,
    )

    asset = _store_asset(
        settings,
        user_id=user.id,
        item_id=item.id,
        filename=filename,
        data=data,
        digest=digest,
    )
    session.add(asset)
    session.commit()

    note = json.dumps(parsed.metadata, ensure_ascii=False)[:120] if parsed.metadata else None
    _record_import_job(
        session,
        user_id=user.id,
        item_id=item.id,
        status=IngestionJobStatus.SUCCEEDED,
        note=note,
    )
    return item


def preflight_hashes(session: Session, user_id: str, hashes: list[str]) -> list[str]:
    """Return the subset of ``hashes`` already present for this user."""

    if not hashes:
        raise BadRequestError("contentHashes 不能为空")
    if len(hashes) > 20:
        raise BadRequestError("contentHashes 最多 20 条")
    normalized: list[str] = []
    for value in hashes:
        candidate = (value or "").strip().lower()
        if not re.fullmatch(r"[0-9a-f]{64}", candidate):
            raise BadRequestError("contentHashes 必须为 SHA-256 十六进制摘要")
        normalized.append(candidate)

    rows = session.execute(
        select(KnowledgeItem.content_hash)
        .where(
            KnowledgeItem.user_id == user_id,
            KnowledgeItem.content_hash.in_(normalized),
        )
        .distinct()
    ).all()
    found = {row[0] for row in rows if row[0]}
    return [value for value in normalized if value in found]


def count_items(session: Session, user_id: str) -> int:
    return int(
        session.execute(
            select(func.count(KnowledgeItem.id)).where(KnowledgeItem.user_id == user_id)
        ).scalar_one()
    )


def mark_failed(session: Session, item: KnowledgeItem, message: str) -> None:
    item.status = KnowledgeStatus.FAILED
    session.add(item)
    session.commit()
    _record_import_job(
        session,
        user_id=item.user_id,
        item_id=item.id,
        status=IngestionJobStatus.FAILED,
        error_message=message,
    )
