package com.agent.mvp.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ImportFileKnowledgeItemRequest(
        @Size(max = 240, message = "title must be <= 240 chars") String title,
        @NotBlank(message = "sourceType is required")
                @Size(max = 24, message = "sourceType must be <= 24 chars")
                String sourceType,
        @Size(max = 800, message = "sourceUri must be <= 800 chars") String sourceUri,
        @NotBlank(message = "content is required") String content) {}
