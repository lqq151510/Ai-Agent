package com.agent.mvp.modelsource.dto;

import jakarta.validation.constraints.Size;

public record UpdateModelSourceRequest(
        @Size(max = 32, message = "providerType must be <= 32 chars") String providerType,
        @Size(max = 120, message = "name must be <= 120 chars") String name,
        @Size(max = 500, message = "baseUrl must be <= 500 chars") String baseUrl,
        @Size(max = 1024, message = "apiKey must be <= 1024 chars") String apiKey,
        @Size(max = 160, message = "defaultModel must be <= 160 chars") String defaultModel,
        Boolean enabled,
        Boolean isDefault) {}
