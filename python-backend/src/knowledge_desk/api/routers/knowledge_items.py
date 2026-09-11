"""Knowledge items, tags, dashboard and ingestion job endpoints.

Route order matters: every static path is declared before the ``{item_id}``
patterns so ``/knowledge-items/search`` and ``/knowledge-items/import/*`` are
never captured as an id.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request, UploadFile
from sqlalchemy.orm import Session

from knowledge_desk.api import serializers
from knowledge_desk.api.deps import get_cipher, get_current_user, get_session, get_settings
from knowledge_desk.api.schemas import (
    BatchOrganizeResponse,
    CreateTagRequest,
    DashboardSummaryResponse,
    ImportFileRequest,
    ImportPreflightRequest,
    ImportPreflightResponse,
    ImportSnippetRequest,
    ImportWebRequest,
    IngestionJobResponse,
    KnowledgeItemPageResponse,
    KnowledgeItemResponse,
    TagResponse,
    UpdateKnowledgeItemRequest,
)
from knowledge_desk.application import (
    ingest_service,
    knowledge_service,
    organize_service,
    review_service,
)
from knowledge_desk.config import Settings
from knowledge_desk.domain.enums import KnowledgeStatus
from knowledge_desk.domain.models import KnowledgeItem, User, now_utc
from knowledge_desk.infrastructure.crypto import SecretCipher

router = APIRouter(prefix="/api/v1", tags=["knowledge-desk"])


def _schedule_auto_organize(
    request: Request,
    background: BackgroundTasks,
    session: Session,
    settings: Settings,
    cipher: SecretCipher,
    user: User,
    item_id: str,
) -> None:
    """Queue auto-organisation for an import when the preference is ``auto``."""

    if not organize_service.should_auto_organize(session, user.id):
        return
    item = session.get(type(session.get(User, user.id)) if False else __import__(
        "knowledge_desk.domain.models", fromlist=["KnowledgeItem"]
    ).KnowledgeItem, item_id)
    if item is None:
        return
    from knowledge_desk.domain.enums import KnowledgeStatus

    item.status = KnowledgeStatus.PROCESSING
    item.updated_at = now_utc()
    session.add(item)
    session.commit()

    background.add_task(
        organize_service.run_background_organize,
        request.app.state.session_factory,
        settings,
        cipher,
        user_id=user.id,
        item_id=item_id,
    )


@router.get("/knowledge-items", response_model=KnowledgeItemPageResponse, summary="分页获取知识条目")
def list_knowledge_items(
    status: list[str] | None = Query(default=None),
    tag: str | None = Query(default=None),
    source_type: str | None = Query(default=None, alias="sourceType"),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None, alias="pageSize"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> KnowledgeItemPageResponse:
    result = knowledge_service.list_items(
        session,
        user.id,
        statuses=status,
        tag=tag,
        source_type=source_type,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return serializers.page_payload(result)


@router.get(
    "/knowledge-items/search", response_model=KnowledgeItemPageResponse, summary="搜索知识条目"
)
def search_knowledge_items(
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    source_type: str | None = Query(default=None, alias="sourceType"),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None, alias="pageSize"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> KnowledgeItemPageResponse:
    result = knowledge_service.search_items(
        session,
        user.id,
        query=q,
        status=status,
        tag=tag,
        source_type=source_type,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return serializers.page_payload(result)


@router.post(
    "/knowledge-items/import/web", response_model=KnowledgeItemResponse, summary="导入网页资料"
)
def import_web(
    payload: ImportWebRequest,
    request: Request,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    item = ingest_service.import_web(
        session, user, url=payload.url, content=payload.content, title=payload.title
    )
    _schedule_auto_organize(request, background, session, settings, cipher, user, item.id)
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/import/snippet", response_model=KnowledgeItemResponse, summary="导入手动片段"
)
def import_snippet(
    payload: ImportSnippetRequest,
    request: Request,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    item = ingest_service.import_snippet(
        session, user, content=payload.content, title=payload.title
    )
    _schedule_auto_organize(request, background, session, settings, cipher, user, item.id)
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/import/file", response_model=KnowledgeItemResponse, summary="导入本地文件资料"
)
def import_file(
    payload: ImportFileRequest,
    request: Request,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    item = ingest_service.import_file_payload(
        session,
        user,
        source_type=payload.source_type,
        source_uri=payload.source_uri,
        content=payload.content,
        title=payload.title,
    )
    _schedule_auto_organize(request, background, session, settings, cipher, user, item.id)
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/import/upload", response_model=KnowledgeItemResponse, summary="上传并解析文档"
)
def import_upload(
    request: Request,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    filename = (file.filename or "").strip() or "upload"
    data = file.file.read()
    item = ingest_service.import_upload(
        session, settings, user, filename=filename, data=data, title=title
    )
    _schedule_auto_organize(request, background, session, settings, cipher, user, item.id)
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/import/preflight",
    response_model=ImportPreflightResponse,
    summary="预检已导入的文件哈希",
)
def preflight_import(
    payload: ImportPreflightRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ImportPreflightResponse:
    existing = ingest_service.preflight_hashes(session, user.id, payload.content_hashes)
    return ImportPreflightResponse(existing_hashes=existing, known_count=len(existing))


@router.post(
    "/knowledge-items/organize-batch",
    response_model=BatchOrganizeResponse,
    summary="批量整理收集箱或失败条目",
)
def organize_batch(
    limit: int = Query(default=organize_service.DEFAULT_BATCH_LIMIT),
    include_failed: bool = Query(default=True, alias="includeFailed"),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> BatchOrganizeResponse:
    result = organize_service.organize_batch(
        session, settings, cipher, user, limit=limit, include_failed=include_failed
    )
    return BatchOrganizeResponse(
        total=result["total"],
        succeeded=result["succeeded"],
        failed=result["failed"],
        total_count=result["total"],
        success_count=result["succeeded"],
        failed_count=result["failed"],
    )


@router.get(
    "/knowledge-items/{item_id}", response_model=KnowledgeItemResponse, summary="获取知识条目详情"
)
def get_knowledge_item(
    item_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    return serializers.item_payload(knowledge_service.get_item(session, user.id, item_id))


@router.put(
    "/knowledge-items/{item_id}", response_model=KnowledgeItemResponse, summary="更新知识条目"
)
def update_knowledge_item(
    item_id: str,
    payload: UpdateKnowledgeItemRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    item = knowledge_service.update_item(
        session,
        user.id,
        item_id,
        title=payload.title,
        summary=payload.summary,
        tags=payload.tags,
    )
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/{item_id}/organize",
    response_model=KnowledgeItemResponse,
    summary="整理单个知识条目",
)
def organize_knowledge_item(
    item_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    item = knowledge_service.get_item(session, user.id, item_id)
    organize_service.organize_item(session, settings, cipher, user, item)
    session.refresh(item)
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/{item_id}/reprocess",
    response_model=KnowledgeItemResponse,
    summary="重新整理单个知识条目",
)
def reprocess_knowledge_item(
    item_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    item = organize_service.reprocess_item(session, settings, cipher, user, item_id)
    return serializers.item_payload(item)


@router.post(
    "/knowledge-items/{item_id}/archive", response_model=KnowledgeItemResponse, summary="归档知识条目"
)
def archive_knowledge_item(
    item_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    return serializers.item_payload(knowledge_service.archive_item(session, user.id, item_id))


@router.post(
    "/knowledge-items/{item_id}/restore", response_model=KnowledgeItemResponse, summary="恢复知识条目"
)
def restore_knowledge_item(
    item_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> KnowledgeItemResponse:
    return serializers.item_payload(knowledge_service.restore_item(session, user.id, item_id))


@router.get("/tags", response_model=list[TagResponse], summary="获取标签列表")
def list_tags(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[TagResponse]:
    return [serializers.tag_usage_payload(usage) for usage in knowledge_service.list_tags(session, user.id)]


@router.post("/tags", response_model=TagResponse, summary="创建自定义标签")
def create_tag(
    payload: CreateTagRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TagResponse:
    tag = knowledge_service.create_tag(session, user.id, payload.name, payload.color)
    return serializers.tag_payload(tag, count=0)


@router.get(
    "/dashboard/summary", response_model=DashboardSummaryResponse, summary="获取首页摘要数据"
)
def dashboard_summary(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DashboardSummaryResponse:
    summary = knowledge_service.dashboard_summary(session, user.id)
    review = review_service.summary(session, user.id)
    return DashboardSummaryResponse(
        total_items=summary["totalItems"],
        inbox_items=summary["inboxItems"],
        ready_items=summary["readyItems"],
        failed_items=summary["failedItems"],
        processing_items=summary["processingItems"],
        archived_items=summary["archivedItems"],
        recent_items=[serializers.item_payload(item) for item in summary["recentItems"]],
        top_tags=[serializers.tag_usage_payload(usage) for usage in summary["topTags"]],
        review=serializers.review_badge_payload(review),
    )


@router.get(
    "/ingestion-jobs", response_model=list[IngestionJobResponse], summary="获取导入与整理任务列表"
)
def list_ingestion_jobs(
    knowledge_item_id: str = Query(alias="knowledgeItemId"),
    limit: int = Query(default=20),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[IngestionJobResponse]:
    jobs = knowledge_service.list_jobs(
        session, user.id, item_id=knowledge_item_id, limit=limit
    )
    return [serializers.job_payload(job) for job in jobs]


@router.get(
    "/ingestion-jobs/{job_id}", response_model=IngestionJobResponse, summary="获取单个任务详情"
)
def get_ingestion_job(
    job_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> IngestionJobResponse:
    return serializers.job_payload(knowledge_service.get_job(session, user.id, job_id))
