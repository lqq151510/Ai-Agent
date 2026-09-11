"""Daily review queue, scheduling maths and validation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from knowledge_desk.domain.enums import ReviewRating
from knowledge_desk.domain.review import schedule_review
from tests.conftest import import_snippet

ARTICLE = (
    "间隔复习的核心是把同样的资料按逐渐拉长的节奏重新取出。\n\n"
    "第一次回顾建立记忆痕迹，随后每次成功回忆都会延长下一次的间隔。"
)

NOW = datetime(2026, 9, 11, 12, 0, tzinfo=timezone.utc)


def _ready_item(client: TestClient, auth: dict[str, str], title: str = "复习资料") -> dict:
    item = import_snippet(client, auth, ARTICLE, title)
    organized = client.post(f"/api/v1/knowledge-items/{item['id']}/organize", headers=auth)
    assert organized.status_code == 200
    return organized.json()


def test_first_time_item_is_due_with_null_schedule(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)

    response = client.get("/api/v1/knowledge-reviews/queue", params={"limit": 10}, headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["dueCount"] == 1
    assert len(body["items"]) == 1
    entry = body["items"][0]
    assert entry["id"] == item["id"]
    assert entry["title"] == "复习资料"
    assert entry["summary"]
    assert entry["updatedAt"]
    # First review has no schedule yet: the renderer expects nulls, not zeros.
    assert entry["dueAt"] is None
    assert entry["intervalDays"] is None
    assert entry["easeFactor"] is None
    assert entry["repetitions"] is None


def test_queue_limit_and_invalid_limit(client: TestClient, auth: dict[str, str]) -> None:
    for index in range(3):
        _ready_item(client, auth, f"资料 {index}")

    limited = client.get("/api/v1/knowledge-reviews/queue", params={"limit": 2}, headers=auth)
    assert len(limited.json()["items"]) == 2
    assert limited.json()["dueCount"] == 3

    assert client.get(
        "/api/v1/knowledge-reviews/queue", params={"limit": 0}, headers=auth
    ).status_code == 400
    assert client.get(
        "/api/v1/knowledge-reviews/queue", params={"limit": "abc"}, headers=auth
    ).status_code == 400


def test_good_rating_schedules_first_interval(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)

    response = client.post(
        f"/api/v1/knowledge-reviews/{item['id']}/complete", json={"rating": "good"}, headers=auth
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["knowledgeItemId"] == item["id"]
    assert body["rating"] == "good"
    assert body["intervalDays"] == 1
    assert body["repetitions"] == 1
    assert body["easeFactor"] == 2.5
    assert datetime.fromisoformat(body["dueAt"].replace("Z", "+00:00")) > datetime.now(timezone.utc)


def test_completed_item_leaves_the_queue_immediately(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)
    client.post(f"/api/v1/knowledge-reviews/{item['id']}/complete", json={"rating": "good"}, headers=auth)

    queue = client.get("/api/v1/knowledge-reviews/queue", headers=auth).json()
    assert queue["dueCount"] == 0

    summary = client.get("/api/v1/knowledge-reviews/summary", headers=auth).json()
    assert summary["dueCount"] == 0
    assert summary["nextDueAt"]


def test_again_resets_schedule(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)
    url = f"/api/v1/knowledge-reviews/{item['id']}/complete"

    client.post(url, json={"rating": "good"}, headers=auth)
    second = client.post(url, json={"rating": "good"}, headers=auth).json()
    assert second["repetitions"] == 2
    assert second["intervalDays"] == 3

    reset = client.post(url, json={"rating": "again"}, headers=auth).json()
    assert reset["repetitions"] == 0
    assert reset["intervalDays"] == 1
    assert reset["easeFactor"] < second["easeFactor"]


def test_easy_extends_interval_and_ease(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)
    url = f"/api/v1/knowledge-reviews/{item['id']}/complete"

    easy = client.post(url, json={"rating": "easy"}, headers=auth).json()
    assert easy["easeFactor"] > 2.5
    assert easy["intervalDays"] >= 4


def test_hard_slows_growth(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)
    url = f"/api/v1/knowledge-reviews/{item['id']}/complete"

    hard = client.post(url, json={"rating": "hard"}, headers=auth).json()
    assert hard["repetitions"] == 0
    assert hard["easeFactor"] < 2.5
    assert hard["intervalDays"] == 1


def test_invalid_rating_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)
    response = client.post(
        f"/api/v1/knowledge-reviews/{item['id']}/complete", json={"rating": "perfect"}, headers=auth
    )
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_unknown_item_and_cross_user_are_404(
    client: TestClient, auth: dict[str, str], second_auth: dict[str, str]
) -> None:
    assert client.post(
        "/api/v1/knowledge-reviews/11111111-2222-3333-4444-555555555555/complete",
        json={"rating": "good"},
        headers=auth,
    ).status_code == 404

    item = _ready_item(client, auth)
    assert client.post(
        f"/api/v1/knowledge-reviews/{item['id']}/complete", json={"rating": "good"}, headers=second_auth
    ).status_code == 404
    assert client.get("/api/v1/knowledge-reviews/queue", headers=second_auth).json()["dueCount"] == 0


def test_archived_item_cannot_be_reviewed(client: TestClient, auth: dict[str, str]) -> None:
    item = _ready_item(client, auth)
    client.post(f"/api/v1/knowledge-items/{item['id']}/archive", headers=auth)
    response = client.post(
        f"/api/v1/knowledge-reviews/{item['id']}/complete", json={"rating": "good"}, headers=auth
    )
    assert response.status_code == 400


def test_unorganised_item_is_not_in_the_queue(client: TestClient, auth: dict[str, str]) -> None:
    import_snippet(client, auth, ARTICLE, "尚未整理")
    assert client.get("/api/v1/knowledge-reviews/queue", headers=auth).json()["dueCount"] == 0


def test_schedule_maths_is_deterministic() -> None:
    first = schedule_review(ReviewRating.GOOD, now=NOW)
    assert (first.interval_days, first.repetitions, first.ease_factor) == (1, 1, 2.5)
    assert first.due_at == NOW + timedelta(days=1)

    second = schedule_review(
        ReviewRating.GOOD, now=NOW, interval_days=first.interval_days,
        ease_factor=first.ease_factor, repetitions=first.repetitions,
    )
    assert (second.interval_days, second.repetitions) == (3, 2)

    third = schedule_review(
        ReviewRating.GOOD, now=NOW, interval_days=second.interval_days,
        ease_factor=second.ease_factor, repetitions=second.repetitions,
    )
    assert third.interval_days == 8  # round(3 * 2.5)

    hard = schedule_review(ReviewRating.HARD, now=NOW, interval_days=10, ease_factor=2.5, repetitions=4)
    assert hard.interval_days == 12
    assert hard.ease_factor == 2.35
    assert hard.repetitions == 4

    easy = schedule_review(ReviewRating.EASY, now=NOW, interval_days=10, ease_factor=2.5, repetitions=4)
    assert easy.interval_days == 33  # round(10 * 2.5 * 1.3)
    assert easy.ease_factor == 2.65
    assert easy.repetitions == 5

    again = schedule_review(ReviewRating.AGAIN, now=NOW, interval_days=30, ease_factor=2.5, repetitions=6)
    assert (again.interval_days, again.repetitions) == (1, 0)
    assert again.ease_factor == 2.3


def test_ease_factor_floor_is_enforced() -> None:
    state = schedule_review(ReviewRating.AGAIN, now=NOW, ease_factor=1.4, repetitions=1)
    for _ in range(5):
        state = schedule_review(
            ReviewRating.AGAIN, now=NOW, interval_days=state.interval_days,
            ease_factor=state.ease_factor, repetitions=state.repetitions,
        )
    assert state.ease_factor >= 1.3
