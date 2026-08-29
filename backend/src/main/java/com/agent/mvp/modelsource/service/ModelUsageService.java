package com.agent.mvp.modelsource.service;

import com.agent.mvp.modelsource.dto.UserMetricsResponse;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.entity.ModelUsageLog;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.modelsource.repo.ModelUsageLogRepository;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ModelUsageService {

    private final ModelUsageLogRepository modelUsageLogRepository;
    private final ModelSourceRepository modelSourceRepository;

    public ModelUsageService(
            ModelUsageLogRepository modelUsageLogRepository,
            ModelSourceRepository modelSourceRepository) {
        this.modelUsageLogRepository = modelUsageLogRepository;
        this.modelSourceRepository = modelSourceRepository;
    }

    @Transactional
    public ModelUsageLog recordUsage(
            UUID userId,
            UUID modelSourceId,
            String providerType,
            String modelName,
            int promptTokens,
            int completionTokens,
            long latencyMs,
            String status,
            String errorMessage) {
        ModelUsageLog log =
                ModelUsageLog.builder()
                        .userId(userId)
                        .modelSourceId(modelSourceId)
                        .providerType(providerType)
                        .modelName(modelName != null ? modelName : "unknown")
                        .promptTokens(Math.max(0, promptTokens))
                        .completionTokens(Math.max(0, completionTokens))
                        .totalTokens(Math.max(0, promptTokens) + Math.max(0, completionTokens))
                        .latencyMs(Math.max(0L, latencyMs))
                        .status(status != null ? status : "success")
                        .errorMessage(errorMessage)
                        .build();
        log.onCreate();
        modelUsageLogRepository.insert(log);
        return log;
    }

    public UserMetricsResponse getMetrics(UUID userId) {
        List<ModelUsageLog> logs =
                modelUsageLogRepository.selectList(
                        new LambdaQueryWrapper<ModelUsageLog>()
                                .eq(ModelUsageLog::getUserId, userId)
                                .orderByDesc(ModelUsageLog::getCreatedAt));

        long totalTokens = 0;
        long promptTokens = 0;
        long completionTokens = 0;
        long todayTokens = 0;
        long totalCalls = logs.size();
        long successfulCalls = 0;
        long failedCalls = 0;
        long totalLatencyMs = 0;
        Map<String, Long> providerTokens = new HashMap<>();

        Instant startOfToday =
                LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);

        for (ModelUsageLog log : logs) {
            long tokens = log.getTotalTokens() != null ? log.getTotalTokens() : 0;
            totalTokens += tokens;
            promptTokens += log.getPromptTokens() != null ? log.getPromptTokens() : 0;
            completionTokens += log.getCompletionTokens() != null ? log.getCompletionTokens() : 0;

            if (log.getCreatedAt() != null && log.getCreatedAt().isAfter(startOfToday)) {
                todayTokens += tokens;
            }

            if ("success".equalsIgnoreCase(log.getStatus())) {
                successfulCalls++;
            } else {
                failedCalls++;
            }

            totalLatencyMs += log.getLatencyMs() != null ? log.getLatencyMs() : 0;

            String provider = log.getProviderType() != null ? log.getProviderType() : "other";
            providerTokens.put(provider, providerTokens.getOrDefault(provider, 0L) + tokens);
        }

        double successRate = totalCalls > 0 ? (double) successfulCalls / totalCalls * 100.0 : 100.0;
        long averageLatencyMs = totalCalls > 0 ? totalLatencyMs / totalCalls : 0;

        List<ModelSource> sources =
                modelSourceRepository.selectList(
                        new LambdaQueryWrapper<ModelSource>().eq(ModelSource::getUserId, userId));
        int totalModelSources = sources.size();
        int activeModelSources =
                (int)
                        sources.stream()
                                .filter(
                                        s ->
                                                Boolean.TRUE.equals(s.getEnabled())
                                                        && "ok"
                                                                .equalsIgnoreCase(
                                                                        s.getLastCheckStatus()))
                                .count();

        List<UserMetricsResponse.ModelUsageItemDto> recentLogs =
                logs.stream()
                        .limit(10)
                        .map(
                                l ->
                                        new UserMetricsResponse.ModelUsageItemDto(
                                                l.getId(),
                                                l.getModelSourceId(),
                                                l.getProviderType(),
                                                l.getModelName(),
                                                l.getPromptTokens() != null
                                                        ? l.getPromptTokens()
                                                        : 0,
                                                l.getCompletionTokens() != null
                                                        ? l.getCompletionTokens()
                                                        : 0,
                                                l.getTotalTokens() != null ? l.getTotalTokens() : 0,
                                                l.getLatencyMs() != null ? l.getLatencyMs() : 0,
                                                l.getStatus(),
                                                l.getErrorMessage(),
                                                l.getCreatedAt()))
                        .toList();

        return new UserMetricsResponse(
                totalTokens,
                promptTokens,
                completionTokens,
                todayTokens,
                totalCalls,
                successfulCalls,
                failedCalls,
                Math.round(successRate * 10.0) / 10.0,
                averageLatencyMs,
                totalModelSources,
                activeModelSources,
                providerTokens,
                recentLogs);
    }
}
