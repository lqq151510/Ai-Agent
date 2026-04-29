package com.agent.mvp.tooling.dto;

import java.time.Instant;
import java.util.List;

public record ToolStatsResponse(
        int windowHours,
        long totalRuns,
        long successRuns,
        long failedRuns,
        double successRate,
        long averageDurationMs,
        long p50DurationMs,
        long p95DurationMs,
        long p99DurationMs,
        List<ToolDurationBucket> durationBuckets,
        List<ToolStatsByName> topTools,
        Instant generatedAt
) {
}
