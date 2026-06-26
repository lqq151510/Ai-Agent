package com.agent.mvp.settings.dto;

import java.time.Instant;
import java.util.UUID;

public record SettingsProfileResponse(
        UUID userId,
        String email,
        String displayName,
        String avatarUrl,
        String organizeMode,
        String privacyMode,
        UUID defaultModelSourceId,
        UUID summaryModelSourceId,
        UUID taggingModelSourceId,
        Instant createdAt,
        Instant updatedAt) {}
