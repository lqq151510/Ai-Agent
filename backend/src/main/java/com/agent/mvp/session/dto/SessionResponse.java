package com.agent.mvp.session.dto;

import com.agent.mvp.agent.ModelProviderType;
import java.time.Instant;
import java.util.UUID;

public record SessionResponse(
        UUID id,
        String title,
        ModelProviderType provider,
        String model,
        String taskType,
        String taskGoal,
        String taskStatus,
        Integer contextTokenLimit,
        Instant createdAt,
        Instant updatedAt) {}
