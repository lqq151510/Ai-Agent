package com.agent.mvp.modelsource.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateModelSourceRequest(
        @NotBlank(message = "providerType is required")
                @Size(max = 32, message = "providerType must be <= 32 chars")
                String providerType,
        @NotBlank(message = "name is required")
                @Size(max = 120, message = "name must be <= 120 chars")
                String name,
        @NotBlank(message = "baseUrl is required")
                @Size(max = 500, message = "baseUrl must be <= 500 chars")
                String baseUrl,
        @NotBlank(message = "apiKey is required")
                @Size(max = 1024, message = "apiKey must be <= 1024 chars")
                String apiKey,
        @NotBlank(message = "defaultModel is required")
                @Size(max = 160, message = "defaultModel must be <= 160 chars")
                String defaultModel,
        Boolean enabled,
        Boolean isDefault) {}
