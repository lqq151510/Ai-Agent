package com.agent.mvp.knowledge.review.dto;

import java.time.Instant;

public record KnowledgeReviewSummaryResponse(long dueCount, Instant nextDueAt) {}
