"""Review queue services: due calculation, scheduling and persistence."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from knowledge_desk.application import knowledge_service as knowledge
from knowledge_desk.domain.enums import KnowledgeStatus, ReviewRating
from knowledge_desk.domain.models import KnowledgeItem, ReviewState, now_utc
from knowledge_desk.domain.review import DEFAULT_EASE_FACTOR, schedule_review
from knowledge_desk.errors import BadRequestError, NotFoundError

DEFAULT_QUEUE_LIMIT = 10
MAX_QUEUE_LIMIT = 20
# A ready item becomes reviewable this long after its last update when no
# explicit schedule exists yet.
DEFAULT_FIRST_INTERVAL_DAYS = 1


def normalize_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_QUEUE_LIMIT
    try:
        resolved = int(limit)
    except (TypeError, ValueError) as exc:
        raise BadRequestError("limit 参数不合法") from exc
    if resolved < 1:
        raise BadRequestError("limit 必须大于 0")
    return min(MAX_QUEUE_LIMIT, resolved)


def parse_rating(value: str | None) -> ReviewRating:
    try:
        return ReviewRating((value or "").strip().lower())
    except ValueError as exc:
        raise BadRequestError("无效的复习反馈") from exc


def _due_expression():
    """Effective due timestamp: explicit review state, otherwise first interval."""

    return func.coalesce(ReviewState.due_at, KnowledgeItem.updated_at)


def _due_rows(session: Session, user_id: str, now: datetime):
    return (
        session.execute(
            select(KnowledgeItem, ReviewState)
            .outerjoin(ReviewState, ReviewState.knowledge_item_id == KnowledgeItem.id)
            .where(
                KnowledgeItem.user_id == user_id,
                KnowledgeItem.status == KnowledgeStatus.READY,
                _due_expression() <= now,
            )
            .order_by(_due_expression().asc(), KnowledgeItem.updated_at.asc())
        )
        .all()
    )


def queue(session: Session, user_id: str, *, limit: int | None = None) -> dict:
    resolved_limit = normalize_limit(limit)
    now = now_utc()
    rows = _due_rows(session, user_id, now)
    due_count = len(rows)

    items = []
    for item, state in rows[:resolved_limit]:
        items.append(
            {
                "id": item.id,
                "title": item.title,
                "sourceType": item.source_type.value,
                "summary": item.summary or "",
                "tags": [
                    {"id": tag.id, "name": tag.name, "color": tag.color} for tag in item.tags
                ],
                "updatedAt": item.updated_at,
                "dueAt": state.due_at if state is not None else None,
                "intervalDays": (
                    max(1, state.interval_days) if state is not None and state.interval_days > 0 else None
                ),
                "easeFactor": state.ease_factor if state is not None else None,
                "repetitions": state.repetitions if state is not None else None,
            }
        )
    return {"items": items, "dueCount": due_count}


def summary(session: Session, user_id: str) -> dict:
    now = now_utc()
    rows = _due_rows(session, user_id, now)
    due_count = len(rows)

    next_due = session.execute(
        select(func.min(_due_expression())).where(
            KnowledgeItem.user_id == user_id,
            KnowledgeItem.status == KnowledgeStatus.READY,
        )
    ).scalar_one_or_none()

    return {
        "dueCount": due_count,
        "nextDueAt": next_due if next_due is not None and next_due > now else None,
    }


def complete(session: Session, user_id: str, item_id: str, rating: str | None) -> dict:
    parsed_rating = parse_rating(rating)
    item = knowledge.get_item(session, user_id, item_id)
    if item.status is KnowledgeStatus.ARCHIVED:
        raise BadRequestError("已归档的知识条目无法参与复习")

    state = session.execute(
        select(ReviewState).where(
            ReviewState.user_id == user_id, ReviewState.knowledge_item_id == item.id
        )
    ).scalar_one_or_none()

    now = now_utc()
    schedule = schedule_review(
        parsed_rating,
        now=now,
        interval_days=state.interval_days if state is not None else 0,
        ease_factor=state.ease_factor if state is not None else DEFAULT_EASE_FACTOR,
        repetitions=state.repetitions if state is not None else 0,
    )

    if state is None:
        state = ReviewState(
            user_id=user_id,
            knowledge_item_id=item.id,
            due_at=schedule.due_at,
            interval_days=schedule.interval_days,
            ease_factor=schedule.ease_factor,
            repetitions=schedule.repetitions,
            last_rating=schedule.last_rating,
            last_reviewed_at=schedule.last_reviewed_at,
        )
    else:
        state.due_at = schedule.due_at
        state.interval_days = schedule.interval_days
        state.ease_factor = schedule.ease_factor
        state.repetitions = schedule.repetitions
        state.last_rating = schedule.last_rating
        state.last_reviewed_at = schedule.last_reviewed_at
        state.updated_at = now

    session.add(state)
    session.commit()

    return {
        "knowledgeItemId": item.id,
        "rating": schedule.last_rating.value,
        "dueAt": schedule.due_at,
        "intervalDays": schedule.interval_days,
        "easeFactor": schedule.ease_factor,
        "repetitions": schedule.repetitions,
    }


def get_state(session: Session, user_id: str, item_id: str) -> ReviewState:
    resolved_id = knowledge.parse_item_id(item_id)
    state = session.execute(
        select(ReviewState).where(
            ReviewState.user_id == user_id, ReviewState.knowledge_item_id == resolved_id
        )
    ).scalar_one_or_none()
    if state is None:
        raise NotFoundError("复习状态不存在")
    return state
