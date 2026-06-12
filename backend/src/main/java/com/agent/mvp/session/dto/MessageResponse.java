package com.agent.mvp.session.dto;

import java.time.Instant;
import java.util.UUID;

public record MessageResponse(
        UUID id,
        String role,
        String content,
        String toolTrace,
        String provider,
        String model,
        Instant createdAt) {}
