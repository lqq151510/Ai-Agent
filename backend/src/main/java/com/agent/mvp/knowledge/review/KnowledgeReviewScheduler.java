package com.agent.mvp.knowledge.review;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** Pure interval algorithm. Callers own persistence and provide the review time explicitly. */
public class KnowledgeReviewScheduler {

    static final double INITIAL_EASE_FACTOR = 2.5;
    static final double MIN_EASE_FACTOR = 1.3;

    public ReviewSchedule next(
            KnowledgeReviewState current, KnowledgeReviewRating rating, Instant reviewedAt) {
        if (rating == null) {
            throw new IllegalArgumentException("rating is required");
        }
        if (reviewedAt == null) {
            throw new IllegalArgumentException("reviewedAt is required");
        }

        int repetitions =
                current == null || current.getRepetitions() == null
                        ? 0
                        : Math.max(0, current.getRepetitions());
        int currentIntervalDays =
                current == null || current.getIntervalDays() == null
                        ? 1
                        : Math.max(1, current.getIntervalDays());
        double currentEaseFactor =
                current == null || current.getEaseFactor() == null
                        ? INITIAL_EASE_FACTOR
                        : Math.max(MIN_EASE_FACTOR, current.getEaseFactor());

        int intervalDays;
        int nextRepetitions;
        double nextEaseFactor;
        switch (rating) {
            case AGAIN -> {
                intervalDays = 1;
                nextRepetitions = 0;
                nextEaseFactor = Math.max(MIN_EASE_FACTOR, currentEaseFactor - 0.2);
            }
            case HARD -> {
                intervalDays = current == null ? 1 : ceilAtLeastOne(currentIntervalDays * 1.2);
                nextRepetitions = repetitions + 1;
                nextEaseFactor = Math.max(MIN_EASE_FACTOR, currentEaseFactor - 0.15);
            }
            case GOOD -> {
                intervalDays =
                        goodIntervalDays(repetitions, currentIntervalDays, currentEaseFactor);
                nextRepetitions = repetitions + 1;
                nextEaseFactor = currentEaseFactor;
            }
            case EASY -> {
                intervalDays =
                        easyIntervalDays(repetitions, currentIntervalDays, currentEaseFactor);
                nextRepetitions = repetitions + 1;
                nextEaseFactor = currentEaseFactor + 0.15;
            }
            default -> throw new IllegalStateException("Unsupported review rating: " + rating);
        }

        return new ReviewSchedule(
                reviewedAt.plus(intervalDays, ChronoUnit.DAYS),
                intervalDays,
                nextEaseFactor,
                nextRepetitions);
    }

    private int goodIntervalDays(int repetitions, int currentIntervalDays, double easeFactor) {
        if (repetitions == 0) {
            return 1;
        }
        if (repetitions == 1) {
            return 3;
        }
        return ceilAtLeastOne(currentIntervalDays * easeFactor);
    }

    private int easyIntervalDays(int repetitions, int currentIntervalDays, double easeFactor) {
        if (repetitions == 0) {
            return 3;
        }
        if (repetitions == 1) {
            return 7;
        }
        return ceilAtLeastOne(currentIntervalDays * (easeFactor + 0.15));
    }

    private int ceilAtLeastOne(double value) {
        return Math.max(1, (int) Math.ceil(value));
    }
}
