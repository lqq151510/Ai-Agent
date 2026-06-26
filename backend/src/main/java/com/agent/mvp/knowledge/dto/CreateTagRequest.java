package com.agent.mvp.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateTagRequest(
        @NotBlank(message = "name is required")
                @Size(max = 80, message = "name must be <= 80 chars")
                String name,
        @Size(max = 24, message = "color must be <= 24 chars") String color) {}
