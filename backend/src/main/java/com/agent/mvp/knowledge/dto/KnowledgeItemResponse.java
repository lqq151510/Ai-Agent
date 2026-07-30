package com.agent.mvp.knowledge.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record KnowledgeItemResponse(
        UUID id,
        String sourceType,
        String title,
        String sourceUri,
        String rawContent,
        String cleanedContent,
        String summary,
        String status,
        String language,
        int wordCount,
        List<TagResponse> tags,
        Instant createdAt,
        Instant updatedAt,
        Instant archivedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) KnowledgeSourceAssetResponse sourceAsset) {}
