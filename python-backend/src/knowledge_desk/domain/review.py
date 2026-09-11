"""Spaced-repetition scheduling for the daily review queue.

A compact SM-2 variant: the same rating vocabulary the desktop exposes
(``again`` / ``hard`` / ``good`` / ``easy``) with deterministic, testable
interval maths. ``now`` is always injected so tests do not depend on the wall
clock.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from knowledge_desk.domain.enums import ReviewRating

MIN_EASE_FACTOR = 1.3
MAX_EASE_FACTOR = 3.0
DEFAULT_EASE_FACTOR = 2.5
AGAIN_INTERVAL_DAYS = 1
HARD_EASE_DELTA = -0.15
EASY_EASE_DELTA = 0.15
HARD_INTERVAL_MULTIPLIER = 1.2
EASY_INTERVAL_MULTIPLIER = 1.3
MAX_INTERVAL_DAYS = 365


@dataclass(frozen=True)
class ReviewSchedule:
    interval_days: int
    ease_factor: float
    repetitions: int
    due_at: datetime
    last_rating: ReviewRating
    last_reviewed_at: datetime


def _clamp_ease(value: float) -> float:
    return round(min(MAX_EASE_FACTOR, max(MIN_EASE_FACTOR, value)), 4)


def _clamp_interval(value: float) -> int:
    # Half-up rounding: 32.5 days becomes 33, which is what a reader expects.
    return max(1, min(MAX_INTERVAL_DAYS, int(value + 0.5)))


def schedule_review(
    rating: ReviewRating,
    *,
    now: datetime,
    interval_days: int = 0,
    ease_factor: float = DEFAULT_EASE_FACTOR,
    repetitions: int = 0,
) -> ReviewSchedule:
    """Compute the next review state for ``rating``.

    - ``again``: reset repetitions, pull the interval back to one day.
    - ``hard``: small interval growth, slightly lower ease.
    - ``good``: classic 1 / 3 / interval*ease progression.
    - ``easy``: larger jump forward and a higher ease.
    """

    previous_interval = max(0, int(interval_days))
    previous_repetitions = max(0, int(repetitions))
    ease = _clamp_ease(float(ease_factor))

    if rating is ReviewRating.AGAIN:
        next_repetitions = 0
        next_interval = AGAIN_INTERVAL_DAYS
        next_ease = _clamp_ease(ease - 0.2)
    elif rating is ReviewRating.HARD:
        next_repetitions = previous_repetitions
        next_interval = _clamp_interval(max(previous_interval, 1) * HARD_INTERVAL_MULTIPLIER)
        next_ease = _clamp_ease(ease + HARD_EASE_DELTA)
    elif rating is ReviewRating.EASY:
        next_repetitions = previous_repetitions + 1
        base = previous_interval if previous_interval > 0 else 1
        next_interval = _clamp_interval(max(base * ease * EASY_INTERVAL_MULTIPLIER, 4))
        next_ease = _clamp_ease(ease + EASY_EASE_DELTA)
    else:  # ReviewRating.GOOD
        next_repetitions = previous_repetitions + 1
        if next_repetitions == 1:
            next_interval = 1
        elif next_repetitions == 2:
            next_interval = 3
        else:
            next_interval = _clamp_interval(max(previous_interval, 1) * ease)
        next_ease = ease

    reviewed_at = now.astimezone(timezone.utc)
    return ReviewSchedule(
        interval_days=next_interval,
        ease_factor=next_ease,
        repetitions=next_repetitions,
        due_at=reviewed_at + timedelta(days=next_interval),
        last_rating=rating,
        last_reviewed_at=reviewed_at,
    )
