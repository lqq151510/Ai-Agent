package com.agent.mvp.knowledge.dto;

import jakarta.validation.constraints.Size;
import java.util.List;

public record UpdateKnowledgeItemRequest(
        @Size(max = 240, message = "title must be <= 240 chars") String title,
        String summary,
        @Size(max = 24, message = "status must be <= 24 chars") String status,
        List<@Size(max = 80, message = "tag name must be <= 80 chars") String> tags) {}
