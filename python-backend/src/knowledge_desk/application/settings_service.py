"""Profile preferences plus JSON backup export / merge-import."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from knowledge_desk.application import knowledge_service as knowledge
from knowledge_desk.domain.enums import (
    KnowledgeStatus,
    OrganizeMode,
    PrivacyMode,
    ProviderType,
    ReviewRating,
    SourceAssetOrigin,
    SourceType,
)
from knowledge_desk.domain.models import (
    KnowledgeItem,
    ModelSource,
    ReviewState,
    SourceAsset,
    Tag,
    User,
    UserPreference,
    now_utc,
)
from knowledge_desk.errors import BadRequestError

BACKUP_SCHEMA_VERSION = 1
MAX_BACKUP_ITEMS = 5_000
MAX_BACKUP_TAGS = 1_000
DEFAULT_ASSET_MEDIA_TYPE = "application/octet-stream"


def parse_organize_mode(value: str | None) -> OrganizeMode:
    try:
        return OrganizeMode((value or "").strip().lower())
    except ValueError as exc:
        raise BadRequestError("organizeMode 不合法") from exc


def parse_privacy_mode(value: str | None) -> PrivacyMode:
    try:
        return PrivacyMode((value or "").strip().lower())
    except ValueError as exc:
        raise BadRequestError("privacyMode 不合法") from exc


def get_profile(session: Session, user: User) -> dict:
    preferences = knowledge_service_preferences(session, user.id)
    return {
        "id": user.id,
        "email": user.email,
        "displayName": user.display_name,
        "avatarUrl": user.avatar_url,
        "organizeMode": preferences.organize_mode.value,
        "privacyMode": preferences.privacy_mode.value,
        "defaultModelSourceId": preferences.default_model_source_id,
        "summaryModelSourceId": preferences.summary_model_source_id,
        "taggingModelSourceId": preferences.tagging_model_source_id,
    }


def knowledge_service_preferences(session: Session, user_id: str) -> UserPreference:
    from knowledge_desk.application.auth_service import ensure_preferences

    return ensure_preferences(session, user_id)


def _resolve_owned_source(session: Session, user_id: str, source_id: str | None) -> str | None:
    if not source_id:
        return None
    source = session.execute(
        select(ModelSource).where(ModelSource.id == source_id, ModelSource.user_id == user_id)
    ).scalar_one_or_none()
    if source is None:
        raise BadRequestError("指定的模型源不存在")
    return source.id


def update_profile(session: Session, user: User, draft: dict) -> dict:
    preferences = knowledge_service_preferences(session, user.id)

    if draft.get("displayName") is not None:
        user.display_name = str(draft["displayName"]).strip()[:120] or None
    if draft.get("avatarUrl") is not None:
        user.avatar_url = str(draft["avatarUrl"]).strip()[:510] or None
    if draft.get("organizeMode") is not None:
        preferences.organize_mode = parse_organize_mode(draft["organizeMode"])
    if draft.get("privacyMode") is not None:
        preferences.privacy_mode = parse_privacy_mode(draft["privacyMode"])

    bindings = (
        ("defaultModelSourceId", "clearDefaultModelSource", "default_model_source_id"),
        ("summaryModelSourceId", "clearSummaryModelSource", "summary_model_source_id"),
        ("taggingModelSourceId", "clearTaggingModelSource", "tagging_model_source_id"),
    )
    for field, clear_field, column in bindings:
        if draft.get(field) is not None:
            setattr(
                preferences, column, _resolve_owned_source(session, user.id, draft.get(field))
            )
        elif draft.get(clear_field):
            setattr(preferences, column, None)

    preferences.updated_at = now_utc()
    user.updated_at = now_utc()
    session.add(preferences)
    session.add(user)
    session.commit()
    return get_profile(session, user)


# --------------------------------------------------------------------------- #
# Backup export / import
# --------------------------------------------------------------------------- #


def _serialize_asset(asset: SourceAsset | None) -> dict | None:
    if asset is None:
        return None
    return {
        "id": asset.id,
        "originalFilename": asset.original_filename,
        "mediaType": asset.mime_type or DEFAULT_ASSET_MEDIA_TYPE,
        "byteSize": int(asset.size_bytes),
        "origin": asset.origin.value,
        "availability": "available",
    }


def _serialize_review_state(state: ReviewState) -> dict:
    return {
        "knowledgeItemId": state.knowledge_item_id,
        "dueAt": state.due_at,
        "intervalDays": max(1, int(state.interval_days)),
        "easeFactor": max(1.3, float(state.ease_factor)),
        "repetitions": max(0, int(state.repetitions)),
        "lastRating": (state.last_rating or ReviewRating.GOOD).value,
        "lastReviewedAt": state.last_reviewed_at or state.updated_at,
        "createdAt": state.created_at,
        "updatedAt": state.updated_at,
    }


def export_backup(session: Session, user: User) -> dict:
    preferences = knowledge_service_preferences(session, user.id)
    items = (
        session.execute(
            select(KnowledgeItem)
            .where(KnowledgeItem.user_id == user.id)
            .order_by(KnowledgeItem.created_at.asc())
            .limit(MAX_BACKUP_ITEMS)
        )
        .scalars()
        .all()
    )
    tags = (
        session.execute(
            select(Tag).where(Tag.user_id == user.id).order_by(Tag.created_at.asc()).limit(MAX_BACKUP_TAGS)
        )
        .scalars()
        .all()
    )
    states = (
        session.execute(
            select(ReviewState).where(ReviewState.user_id == user.id).order_by(ReviewState.created_at.asc())
        )
        .scalars()
        .all()
    )

    return {
        "schemaVersion": BACKUP_SCHEMA_VERSION,
        "exportedAt": datetime.now(timezone.utc),
        "preferences": {
            "displayName": user.display_name,
            "avatarUrl": user.avatar_url,
            "organizeMode": preferences.organize_mode.value,
            "privacyMode": preferences.privacy_mode.value,
        },
        "tags": [
            {
                "id": tag.id,
                "name": tag.name,
                "color": tag.color,
                "createdAt": tag.created_at,
            }
            for tag in tags
        ],
        "knowledgeItems": [
            {
                "id": item.id,
                "sourceType": item.source_type.value,
                "title": item.title,
                "sourceUri": item.source_uri,
                "rawContent": item.raw_content,
                "cleanedContent": item.cleaned_content,
                "summary": item.summary,
                "status": item.status.value,
                "language": item.language,
                "wordCount": int(item.word_count),
                "createdAt": item.created_at,
                "updatedAt": item.updated_at,
                "archivedAt": item.archived_at,
                "sourceAsset": _serialize_asset(item.source_asset),
                "tagIds": [tag.id for tag in item.tags],
            }
            for item in items
        ],
        # Credentials are deliberately never part of a backup.
        "modelSourcesIncluded": False,
        "reviewStates": [_serialize_review_state(state) for state in states],
    }


def _parse_backup_timestamp(value: object, field: str) -> datetime | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise BadRequestError(f"备份中的 {field} 时间格式不合法") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_source_type(value: object) -> SourceType:
    try:
        return SourceType(str(value).strip().lower())
    except ValueError as exc:
        raise BadRequestError("备份中包含不支持的来源类型") from exc


def _parse_status(value: object) -> KnowledgeStatus:
    try:
        return KnowledgeStatus(str(value).strip().lower())
    except ValueError as exc:
        raise BadRequestError("备份中包含不支持的知识条目状态") from exc


def _resolve_backup_id(value: object) -> str:
    raw = str(value or "").strip()
    try:
        return str(uuid.UUID(raw))
    except (ValueError, AttributeError):
        return str(uuid.uuid4())


def import_backup(session: Session, user: User, payload: dict) -> dict:
    if int(payload.get("schemaVersion") or 0) != BACKUP_SCHEMA_VERSION:
        raise BadRequestError("不支持该备份版本")
    if payload.get("modelSourcesIncluded"):
        raise BadRequestError("备份中包含不允许恢复的模型配置")

    raw_tags = payload.get("tags") or []
    raw_items = payload.get("knowledgeItems") or []
    raw_states = payload.get("reviewStates") or []
    if not isinstance(raw_tags, list) or not isinstance(raw_items, list):
        raise BadRequestError("备份结构不合法")
    if len(raw_items) > MAX_BACKUP_ITEMS or len(raw_tags) > MAX_BACKUP_TAGS:
        raise BadRequestError("备份内容超出允许的条数上限")

    # Tags are identified by name inside the target account. Backup ids are only
    # used as a mapping key: reusing them verbatim would collide with the
    # originating account's rows (ids are global primary keys).
    tags_by_name: dict[str, Tag] = {
        tag.name.lower(): tag
        for tag in session.execute(select(Tag).where(Tag.user_id == user.id)).scalars().all()
    }
    tags_by_backup_id: dict[str, Tag] = {}
    created_tags = 0
    for raw_tag in raw_tags:
        if not isinstance(raw_tag, dict):
            raise BadRequestError("备份中的标签结构不合法")
        name = str(raw_tag.get("name") or "").strip()
        if not name:
            continue
        tag = tags_by_name.get(name.lower())
        if tag is None:
            tag = Tag(
                user_id=user.id,
                name=name,
                color=(str(raw_tag.get("color")).strip() if raw_tag.get("color") else None),
            )
            session.add(tag)
            session.flush()
            tags_by_name[name.lower()] = tag
            created_tags += 1
        backup_tag_id = str(raw_tag.get("id") or "").strip()
        if backup_tag_id:
            tags_by_backup_id[backup_tag_id] = tag

    # Items already owned by this account make the import idempotent. Ids that
    # exist for a *different* account are kept out of the way by generating a
    # fresh id, so a restore never collides with the origin account's rows.
    own_item_ids = {
        item_id
        for (item_id,) in session.execute(
            select(KnowledgeItem.id).where(KnowledgeItem.user_id == user.id)
        ).all()
    }
    all_item_ids = {item_id for (item_id,) in session.execute(select(KnowledgeItem.id)).all()}

    item_id_map: dict[str, str] = {}
    imported_items = 0
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            raise BadRequestError("备份中的知识条目结构不合法")
        backup_item_id = _resolve_backup_id(raw_item.get("id"))
        if backup_item_id in own_item_ids:
            # Merge semantics: never overwrite an item that is already present.
            continue
        title = str(raw_item.get("title") or "").strip()
        if not title:
            raise BadRequestError("备份中的知识条目缺少标题")

        resolved_item_id = (
            backup_item_id if backup_item_id not in all_item_ids else str(uuid.uuid4())
        )

        item = KnowledgeItem(
            id=resolved_item_id,
            user_id=user.id,
            source_type=_parse_source_type(raw_item.get("sourceType")),
            title=title[:510],
            source_uri=(str(raw_item.get("sourceUri")).strip() if raw_item.get("sourceUri") else None),
            raw_content=str(raw_item.get("rawContent") or ""),
            cleaned_content=(
                str(raw_item.get("cleanedContent")) if raw_item.get("cleanedContent") else None
            ),
            summary=str(raw_item.get("summary")) if raw_item.get("summary") else None,
            status=_parse_status(raw_item.get("status")),
            language=(str(raw_item.get("language")) if raw_item.get("language") else None),
            word_count=int(raw_item.get("wordCount") or 0),
            created_at=_parse_backup_timestamp(raw_item.get("createdAt"), "createdAt") or now_utc(),
            updated_at=_parse_backup_timestamp(raw_item.get("updatedAt"), "updatedAt") or now_utc(),
            archived_at=_parse_backup_timestamp(raw_item.get("archivedAt"), "archivedAt"),
        )
        item.tags = [
            tags_by_backup_id[tag_id]
            for tag_id in (raw_item.get("tagIds") or [])
            if isinstance(tag_id, str) and tag_id in tags_by_backup_id
        ]
        session.add(item)
        own_item_ids.add(resolved_item_id)
        all_item_ids.add(resolved_item_id)
        item_id_map[backup_item_id] = resolved_item_id
        imported_items += 1

    # Flush the restored items so the review states below can reference them.
    session.flush()

    restored_states = 0
    if isinstance(raw_states, list):
        for raw_state in raw_states:
            if not isinstance(raw_state, dict):
                continue
            backup_item_id = str(raw_state.get("knowledgeItemId") or "").strip()
            item_id = item_id_map.get(backup_item_id)
            if not item_id:
                continue
            due_at = _parse_backup_timestamp(raw_state.get("dueAt"), "dueAt")
            if due_at is None:
                continue
            existing = session.execute(
                select(ReviewState).where(
                    ReviewState.user_id == user.id, ReviewState.knowledge_item_id == item_id
                )
            ).scalar_one_or_none()
            if existing is not None:
                continue
            try:
                last_rating = ReviewRating(str(raw_state.get("lastRating") or "").strip().lower())
            except ValueError:
                last_rating = ReviewRating.GOOD
            session.add(
                ReviewState(
                    user_id=user.id,
                    knowledge_item_id=item_id,
                    due_at=due_at,
                    interval_days=max(1, int(raw_state.get("intervalDays") or 1)),
                    ease_factor=max(1.3, float(raw_state.get("easeFactor") or 2.5)),
                    repetitions=max(0, int(raw_state.get("repetitions") or 0)),
                    last_rating=last_rating,
                    last_reviewed_at=_parse_backup_timestamp(
                        raw_state.get("lastReviewedAt"), "lastReviewedAt"
                    ),
                )
            )
            restored_states += 1

    session.commit()

    parts = [f"已恢复 {imported_items} 条知识条目"]
    if created_tags:
        parts.append(f"新建 {created_tags} 个标签")
    if restored_states:
        parts.append(f"恢复 {restored_states} 条复习进度")
    return {
        "importedItems": imported_items,
        "createdTags": created_tags,
        "restoredReviewStates": restored_states,
        # Preferences and model credentials are intentionally not restored.
        "preferencesRestored": False,
        "modelSourcesRestored": False,
        "message": "，".join(parts) + "。",
    }
