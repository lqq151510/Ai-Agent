package com.agent.mvp.knowledge.review.dto;

import jakarta.validation.constraints.NotBlank;

public record CompleteKnowledgeReviewRequest(
        @NotBlank(message = "rating is required") String rating) {}
