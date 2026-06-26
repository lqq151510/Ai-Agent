package com.agent.mvp.settings.dto;

import jakarta.validation.constraints.Size;
import java.util.UUID;

public record UpdateSettingsProfileRequest(
        @Size(max = 120, message = "displayName must be <= 120 chars") String displayName,
        @Size(max = 500, message = "avatarUrl must be <= 500 chars") String avatarUrl,
        @Size(max = 24, message = "organizeMode must be <= 24 chars") String organizeMode,
        @Size(max = 24, message = "privacyMode must be <= 24 chars") String privacyMode,
        UUID defaultModelSourceId,
        UUID summaryModelSourceId,
        UUID taggingModelSourceId,
        Boolean clearDefaultModelSource,
        Boolean clearSummaryModelSource,
        Boolean clearTaggingModelSource) {}
