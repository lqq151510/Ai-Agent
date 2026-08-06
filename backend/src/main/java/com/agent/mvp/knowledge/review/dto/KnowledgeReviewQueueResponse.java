package com.agent.mvp.knowledge.review.dto;

import java.util.List;

public record KnowledgeReviewQueueResponse(List<KnowledgeReviewItemResponse> items, long dueCount) {}
