"""ORM -> wire payload serialisation.

Everything returned here goes through the single place that decides what a
client may see. Original absolute paths never appear.
"""

from __future__ import annotations

from knowledge_desk.api.schemas import (
    IngestionJobResponse,
    KnowledgeItemResponse,
    KnowledgeItemPageResponse,
    ModelSourceResponse,
    ReviewBadge,
    ReviewItemResponse,
    ReviewQueueResponse,
    ReviewStateResponse,
    ReviewSummaryResponse,
    SettingsStorageResponse,
    SourceAssetResponse,
    TagResponse,
)
from knowledge_desk.application.knowledge_service import Page, TagUsage
from knowledge_desk.domain.models import (
    IngestionJob,
    KnowledgeItem,
    ModelSource,
    ReviewState,
    SourceAsset,
    Tag,
)

DEFAULT_MEDIA_TYPE = "application/octet-stream"


def tag_payload(tag: Tag, *, count: int | None = None) -> TagResponse:
    return TagResponse(id=tag.id, name=tag.name, color=tag.color, count=count)


def tag_usage_payload(usage: TagUsage) -> TagResponse:
    return TagResponse(id=usage.id, name=usage.name, color=usage.color, count=usage.count)


def asset_payload(asset: SourceAsset | None) -> SourceAssetResponse | None:
    if asset is None:
        return None
    return SourceAssetResponse(
        id=asset.id,
        original_filename=asset.original_filename,
        media_type=asset.mime_type or DEFAULT_MEDIA_TYPE,
        byte_size=int(asset.size_bytes),
        origin=asset.origin.value,
        availability="available",
    )


def item_payload(item: KnowledgeItem) -> KnowledgeItemResponse:
    return KnowledgeItemResponse(
        id=item.id,
        source_type=item.source_type.value,
        title=item.title,
        source_uri=item.source_uri,
        raw_content=item.raw_content,
        cleaned_content=item.cleaned_content,
        summary=item.summary,
        status=item.status.value,
        language=item.language,
        word_count=int(item.word_count or 0),
        tags=[tag_payload(tag) for tag in item.tags],
        source_asset=asset_payload(item.source_asset),
        created_at=item.created_at,
        updated_at=item.updated_at,
        archived_at=item.archived_at,
    )


def page_payload(page: Page[KnowledgeItem]) -> KnowledgeItemPageResponse:
    return KnowledgeItemPageResponse(
        items=[item_payload(item) for item in page.items],
        total=page.total,
        page=page.page,
        page_size=page.page_size,
    )


def job_payload(job: IngestionJob) -> IngestionJobResponse:
    return IngestionJobResponse(
        id=job.id,
        knowledge_item_id=job.knowledge_item_id,
        job_type=job.job_type.value,
        status=job.status.value,
        error_message=job.error_message,
        note=job.note,
        started_at=job.started_at,
        finished_at=job.finished_at,
        created_at=job.created_at,
    )


def model_source_payload(source: ModelSource) -> ModelSourceResponse:
    return ModelSourceResponse(
        id=source.id,
        provider_type=source.provider_type.value,
        name=source.name,
        base_url=source.base_url,
        default_model=source.default_model,
        api_key_masked=source.api_key_masked,
        enabled=bool(source.enabled),
        is_default=bool(source.is_default),
        last_check_status=source.last_check_status.value if source.last_check_status else None,
        last_check_message=source.last_check_message,
        last_checked_at=source.last_checked_at,
    )


def storage_payload(summary: dict) -> SettingsStorageResponse:
    return SettingsStorageResponse(
        total_items=summary["totalItems"],
        inbox_items=summary["inboxItems"],
        ready_items=summary["readyItems"],
        failed_items=summary["failedItems"],
        processing_items=summary.get("processingItems", 0),
        archived_items=summary["archivedItems"],
        total_tags=summary["totalTags"],
        total_model_sources=summary["totalModelSources"],
        total_source_assets=summary.get("totalSourceAssets", 0),
        total_review_states=summary.get("totalReviewStates", 0),
    )


def review_badge_payload(summary: dict) -> ReviewBadge:
    return ReviewBadge(due_count=summary["dueCount"], next_due_at=summary["nextDueAt"])


def review_item_payload(entry: dict) -> ReviewItemResponse:
    return ReviewItemResponse(
        id=entry["id"],
        title=entry["title"],
        source_type=entry["sourceType"],
        summary=entry["summary"],
        tags=[TagResponse(**tag) for tag in entry["tags"]],
        updated_at=entry["updatedAt"],
        due_at=entry["dueAt"],
        interval_days=entry["intervalDays"],
        ease_factor=entry["easeFactor"],
        repetitions=entry["repetitions"],
    )


def review_queue_payload(payload: dict) -> ReviewQueueResponse:
    return ReviewQueueResponse(
        items=[review_item_payload(entry) for entry in payload["items"]],
        due_count=payload["dueCount"],
    )


def review_summary_payload(payload: dict) -> ReviewSummaryResponse:
    return ReviewSummaryResponse(
        due_count=payload["dueCount"], next_due_at=payload["nextDueAt"]
    )


def review_state_payload(payload: dict) -> ReviewStateResponse:
    return ReviewStateResponse(**payload)


def review_state_from_orm(state: ReviewState) -> ReviewStateResponse:
    return ReviewStateResponse(
        knowledge_item_id=state.knowledge_item_id,
        rating=(state.last_rating.value if state.last_rating else "good"),
        due_at=state.due_at,
        interval_days=max(1, int(state.interval_days)),
        ease_factor=float(state.ease_factor),
        repetitions=int(state.repetitions),
    )
