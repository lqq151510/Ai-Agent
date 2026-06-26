package com.agent.mvp.modelsource.dto;

import java.time.Instant;
import java.util.UUID;

public record ModelSourceResponse(
        UUID id,
        String providerType,
        String name,
        String baseUrl,
        String apiKeyMasked,
        String defaultModel,
        boolean enabled,
        boolean isDefault,
        String lastCheckStatus,
        String lastCheckMessage,
        Instant lastCheckedAt,
        Instant createdAt,
        Instant updatedAt) {}
