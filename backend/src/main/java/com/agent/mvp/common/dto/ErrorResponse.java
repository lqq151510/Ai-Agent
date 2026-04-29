package com.agent.mvp.common.dto;

import java.time.Instant;

public record ErrorResponse(
        String code,
        String message,
        String requestId,
        Instant timestamp
) {
}
