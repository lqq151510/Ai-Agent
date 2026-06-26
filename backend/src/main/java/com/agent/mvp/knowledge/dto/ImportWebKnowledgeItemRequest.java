package com.agent.mvp.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ImportWebKnowledgeItemRequest(
        @Size(max = 240, message = "title must be <= 240 chars") String title,
        @NotBlank(message = "url is required")
                @Size(max = 800, message = "url must be <= 800 chars")
                String url,
        @NotBlank(message = "content is required") String content) {}
