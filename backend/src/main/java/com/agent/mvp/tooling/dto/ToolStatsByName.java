package com.agent.mvp.tooling.dto;

public record ToolStatsByName(
        String toolName,
        long runs,
        long successRuns,
        long failedRuns,
        double successRate,
        long averageDurationMs,
        long p95DurationMs
) {
}
