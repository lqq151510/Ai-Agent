package com.agent.mvp.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ImportSnippetKnowledgeItemRequest(
        @Size(max = 240, message = "title must be <= 240 chars") String title,
        @NotBlank(message = "content is required") String content) {}
