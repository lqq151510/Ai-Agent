package com.agent.mvp.knowledge.review.dto;

import com.agent.mvp.knowledge.dto.TagResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Safe projection for the review screen. Deliberately excludes raw content, paths, and hashes. */
public record KnowledgeReviewItemResponse(
        UUID id,
        String title,
        String sourceType,
        String summary,
        List<TagResponse> tags,
        Instant updatedAt,
        Instant dueAt,
        Integer intervalDays,
        Double easeFactor,
        Integer repetitions) {}
