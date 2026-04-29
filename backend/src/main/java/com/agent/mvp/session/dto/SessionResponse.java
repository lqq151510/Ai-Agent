package com.agent.mvp.session.dto;

import com.agent.mvp.agent.ModelProviderType;

import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        String title,
        ModelProviderType provider,
        String model,
        Instant createdAt,
        Instant updatedAt
) {
}
