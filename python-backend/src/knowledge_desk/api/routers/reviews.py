"""Daily review queue endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from knowledge_desk.api import serializers
from knowledge_desk.api.deps import get_current_user, get_session
from knowledge_desk.api.schemas import (
    ReviewCompleteRequest,
    ReviewQueueResponse,
    ReviewStateResponse,
    ReviewSummaryResponse,
)
from knowledge_desk.application import review_service
from knowledge_desk.domain.models import User

router = APIRouter(prefix="/api/v1/knowledge-reviews", tags=["reviews"])


@router.get("/queue", response_model=ReviewQueueResponse, summary="获取每日回顾队列")
def review_queue(
    limit: int | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReviewQueueResponse:
    return serializers.review_queue_payload(review_service.queue(session, user.id, limit=limit))


@router.get("/summary", response_model=ReviewSummaryResponse, summary="获取每日回顾摘要")
def review_summary(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReviewSummaryResponse:
    return serializers.review_summary_payload(review_service.summary(session, user.id))


@router.post(
    "/{item_id}/complete", response_model=ReviewStateResponse, summary="提交知识条目的回顾反馈"
)
def complete_review(
    item_id: str,
    payload: ReviewCompleteRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReviewStateResponse:
    return serializers.review_state_payload(
        review_service.complete(session, user.id, item_id, payload.rating)
    )
