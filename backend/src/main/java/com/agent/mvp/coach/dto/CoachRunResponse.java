package com.agent.mvp.coach.dto;

import java.time.Instant;
import java.util.UUID;

public record CoachRunResponse(
        UUID id,
        String runType,
        String title,
        String inputText,
        String outputJson,
        String downloadUrl,
        Instant createdAt
) {
}
