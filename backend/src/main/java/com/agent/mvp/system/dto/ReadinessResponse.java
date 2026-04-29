package com.agent.mvp.system.dto;

import java.time.Instant;
import java.util.List;

public record ReadinessResponse(
        boolean ready,
        List<ReadinessCheck> checks,
        Instant timestamp
) {
}

