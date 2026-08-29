package com.agent.mvp.modelsource.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record UserMetricsResponse(
        long totalTokens,
        long promptTokens,
        long completionTokens,
        long todayTokens,
        long totalCalls,
        long successfulCalls,
        long failedCalls,
        double successRate,
        long averageLatencyMs,
        int totalModelSources,
        int activeModelSources,
        double estimatedCostCny,
        double estimatedCostUsd,
        Map<String, Long> providerTokens,
        List<ModelUsageItemDto> recentLogs) {

    public record ModelUsageItemDto(
            UUID id,
            UUID modelSourceId,
            String providerType,
            String modelName,
            int promptTokens,
            int completionTokens,
            int totalTokens,
            long latencyMs,
            String status,
            String errorMessage,
            Instant createdAt) {}
}
