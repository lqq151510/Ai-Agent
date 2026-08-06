package com.agent.mvp.knowledge.review.dto;

import java.time.Instant;
import java.util.UUID;

public record KnowledgeReviewStateResponse(
        UUID knowledgeItemId,
        String rating,
        Instant dueAt,
        int intervalDays,
        double easeFactor,
        int repetitions) {}
