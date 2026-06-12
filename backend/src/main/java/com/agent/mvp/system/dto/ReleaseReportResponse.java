package com.agent.mvp.system.dto;

import com.agent.mvp.tooling.dto.ToolStatsResponse;
import java.time.Instant;
import java.util.UUID;

public record ReleaseReportResponse(
        int windowHours,
        UUID sessionId,
        ReadinessResponse readiness,
        ModelsResponse models,
        ToolStatsResponse toolStats,
        Instant generatedAt) {}
