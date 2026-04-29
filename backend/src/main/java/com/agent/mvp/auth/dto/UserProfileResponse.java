package com.agent.mvp.auth.dto;

import java.time.Instant;
import java.util.UUID;

public record UserProfileResponse(
        UUID id,
        String email,
        Instant createdAt
) {
}
