package com.agent.mvp.knowledge.review;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class KnowledgeReviewSchedulerTest {

    private static final Instant NOW = Instant.parse("2026-08-06T12:00:00Z");

    private final KnowledgeReviewScheduler scheduler = new KnowledgeReviewScheduler();

    @Test
    void firstReviewRatingsHaveStableIntervalsAndState() {
        assertSchedule(
                scheduler.next(null, KnowledgeReviewRating.AGAIN, NOW),
                1,
                2.3,
                0,
                NOW.plus(1, ChronoUnit.DAYS));
        assertSchedule(
                scheduler.next(null, KnowledgeReviewRating.HARD, NOW),
                1,
                2.35,
                1,
                NOW.plus(1, ChronoUnit.DAYS));
        assertSchedule(
                scheduler.next(null, KnowledgeReviewRating.GOOD, NOW),
                1,
                2.5,
                1,
                NOW.plus(1, ChronoUnit.DAYS));
        assertSchedule(
                scheduler.next(null, KnowledgeReviewRating.EASY, NOW),
                3,
                2.65,
                1,
                NOW.plus(3, ChronoUnit.DAYS));
    }

    @Test
    void goodUsesOneThenThreeDaysBeforeApplyingEaseFactor() {
        KnowledgeReviewState firstGood = state(1, 2.5, 1);
        assertSchedule(
                scheduler.next(firstGood, KnowledgeReviewRating.GOOD, NOW),
                3,
                2.5,
                2,
                NOW.plus(3, ChronoUnit.DAYS));

        KnowledgeReviewState laterGood = state(3, 2.5, 2);
        assertSchedule(
                scheduler.next(laterGood, KnowledgeReviewRating.GOOD, NOW),
                8,
                2.5,
                3,
                NOW.plus(8, ChronoUnit.DAYS));
    }

    @Test
    void againResetsRepetitionsAndNeverDropsEaseBelowOnePointThree() {
        ReviewSchedule next = scheduler.next(state(10, 1.35, 5), KnowledgeReviewRating.AGAIN, NOW);

        assertSchedule(next, 1, 1.3, 0, NOW.plus(1, ChronoUnit.DAYS));
    }

    @Test
    void hardAndEasyApplyTheirLaterReviewRules() {
        assertSchedule(
                scheduler.next(state(5, 2.5, 3), KnowledgeReviewRating.HARD, NOW),
                6,
                2.35,
                4,
                NOW.plus(6, ChronoUnit.DAYS));
        assertSchedule(
                scheduler.next(state(5, 2.5, 3), KnowledgeReviewRating.EASY, NOW),
                14,
                2.65,
                4,
                NOW.plus(14, ChronoUnit.DAYS));
    }

    private KnowledgeReviewState state(int intervalDays, double easeFactor, int repetitions) {
        return KnowledgeReviewState.builder()
                .id(UUID.randomUUID())
                .intervalDays(intervalDays)
                .easeFactor(easeFactor)
                .repetitions(repetitions)
                .build();
    }

    private void assertSchedule(
            ReviewSchedule schedule,
            int intervalDays,
            double easeFactor,
            int repetitions,
            Instant dueAt) {
        assertEquals(intervalDays, schedule.intervalDays());
        assertEquals(easeFactor, schedule.easeFactor());
        assertEquals(repetitions, schedule.repetitions());
        assertEquals(dueAt, schedule.dueAt());
    }
}
