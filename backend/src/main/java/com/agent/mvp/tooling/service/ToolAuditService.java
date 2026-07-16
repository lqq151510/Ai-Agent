package com.agent.mvp.tooling.service;

import com.agent.mvp.tooling.dto.ToolDurationBucket;
import com.agent.mvp.tooling.dto.ToolExecutionResult;
import com.agent.mvp.tooling.dto.ToolStatsByName;
import com.agent.mvp.tooling.dto.ToolStatsResponse;
import com.agent.mvp.tooling.entity.ToolAudit;
import com.agent.mvp.tooling.repo.ToolAuditRepository;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@Profile("legacy")
public class ToolAuditService extends ServiceImpl<ToolAuditRepository, ToolAudit> {

    private final ToolAuditRepository toolAuditRepository;

    public ToolAuditService(ToolAuditRepository toolAuditRepository) {
        this.toolAuditRepository = toolAuditRepository;
    }

    @Async
    public void saveAll(
            UUID userId,
            UUID sessionId,
            String provider,
            String model,
            List<ToolExecutionResult> traces) {
        if (traces == null || traces.isEmpty()) {
            return;
        }

        List<ToolAudit> audits =
                traces.stream()
                        .map(
                                trace -> {
                                    ToolAudit audit = new ToolAudit();
                                    audit.setUserId(userId);
                                    audit.setSessionId(sessionId);
                                    audit.setToolName(trace.toolName());
                                    audit.setArgsJson(trace.argsJson());
                                    audit.setStatus(trace.status());
                                    audit.setDurationMs(trace.durationMs());
                                    audit.setProvider(provider);
                                    audit.setModel(model);
                                    audit.onCreate();
                                    return audit;
                                })
                        .toList();

        saveBatch(audits);
    }

    public ToolStatsResponse stats(UUID userId, int windowHours, UUID sessionId) {
        int safeWindowHours = Math.max(1, Math.min(168, windowHours));
        Instant cutoff = Instant.now().minusSeconds(safeWindowHours * 3600L);
        List<ToolAudit> audits =
                sessionId == null
                        ? toolAuditRepository.selectList(
                                new LambdaQueryWrapper<ToolAudit>()
                                        .eq(ToolAudit::getUserId, userId)
                                        .gt(ToolAudit::getCreatedAt, cutoff)
                                        .orderByDesc(ToolAudit::getCreatedAt))
                        : toolAuditRepository.selectList(
                                new LambdaQueryWrapper<ToolAudit>()
                                        .eq(ToolAudit::getUserId, userId)
                                        .eq(ToolAudit::getSessionId, sessionId)
                                        .gt(ToolAudit::getCreatedAt, cutoff)
                                        .orderByDesc(ToolAudit::getCreatedAt));

        if (audits.isEmpty()) {
            return new ToolStatsResponse(
                    safeWindowHours,
                    0,
                    0,
                    0,
                    0.0,
                    0,
                    0,
                    0,
                    0,
                    defaultBuckets(),
                    List.of(),
                    Instant.now());
        }

        long totalRuns = audits.size();
        long successRuns = audits.stream().filter(this::isSuccess).count();
        long failedRuns = totalRuns - successRuns;
        double successRate = percent(successRuns, totalRuns);

        List<Long> durations = audits.stream().map(ToolAudit::getDurationMs).sorted().toList();

        long avgDuration =
                Math.round(durations.stream().mapToLong(Long::longValue).average().orElse(0));
        long p50 = percentile(durations, 0.50);
        long p95 = percentile(durations, 0.95);
        long p99 = percentile(durations, 0.99);

        List<ToolDurationBucket> buckets = buildBuckets(audits);
        List<ToolStatsByName> topTools = buildToolBreakdown(audits);

        return new ToolStatsResponse(
                safeWindowHours,
                totalRuns,
                successRuns,
                failedRuns,
                successRate,
                avgDuration,
                p50,
                p95,
                p99,
                buckets,
                topTools,
                Instant.now());
    }

    public String statsMarkdown(UUID userId, int windowHours, UUID sessionId) {
        ToolStatsResponse stats = stats(userId, windowHours, sessionId);
        StringBuilder out = new StringBuilder();
        out.append("# Tool Stats\n\n");
        out.append("- Window Hours: ").append(stats.windowHours()).append("\n");
        out.append("- Session Scope: ")
                .append(sessionId == null ? "global" : sessionId)
                .append("\n");
        out.append("- Generated At: ").append(stats.generatedAt()).append("\n\n");

        out.append("## Summary\n\n");
        out.append("- Total Runs: ").append(stats.totalRuns()).append("\n");
        out.append("- Success Runs: ").append(stats.successRuns()).append("\n");
        out.append("- Failed Runs: ").append(stats.failedRuns()).append("\n");
        out.append("- Success Rate: ").append(stats.successRate()).append("%\n");
        out.append("- Avg Duration: ").append(stats.averageDurationMs()).append(" ms\n");
        out.append("- P50/P95/P99: ")
                .append(stats.p50DurationMs())
                .append(" / ")
                .append(stats.p95DurationMs())
                .append(" / ")
                .append(stats.p99DurationMs())
                .append(" ms\n\n");

        out.append("## Duration Buckets\n\n");
        out.append("| Bucket | Count |\n");
        out.append("| --- | ---: |\n");
        for (ToolDurationBucket bucket : stats.durationBuckets()) {
            out.append("| ")
                    .append(bucket.label())
                    .append(" | ")
                    .append(bucket.count())
                    .append(" |\n");
        }
        out.append("\n");

        out.append("## Top Tools\n\n");
        out.append("| Tool | Runs | Success Rate | Avg Ms | P95 Ms |\n");
        out.append("| --- | ---: | ---: | ---: | ---: |\n");
        for (ToolStatsByName tool : stats.topTools()) {
            out.append("| ")
                    .append(tool.toolName())
                    .append(" | ")
                    .append(tool.runs())
                    .append(" | ")
                    .append(tool.successRate())
                    .append("%")
                    .append(" | ")
                    .append(tool.averageDurationMs())
                    .append(" | ")
                    .append(tool.p95DurationMs())
                    .append(" |\n");
        }

        return out.toString();
    }

    private List<ToolStatsByName> buildToolBreakdown(List<ToolAudit> audits) {
        Map<String, List<ToolAudit>> grouped =
                audits.stream().collect(Collectors.groupingBy(ToolAudit::getToolName));

        return grouped.entrySet().stream()
                .map(
                        entry -> {
                            String toolName = entry.getKey();
                            List<ToolAudit> rows = entry.getValue();
                            long runs = rows.size();
                            long successRuns = rows.stream().filter(this::isSuccess).count();
                            long failedRuns = runs - successRuns;
                            long avgDuration =
                                    Math.round(
                                            rows.stream()
                                                    .mapToLong(ToolAudit::getDurationMs)
                                                    .average()
                                                    .orElse(0));
                            List<Long> durations =
                                    rows.stream().map(ToolAudit::getDurationMs).sorted().toList();
                            long p95 = percentile(durations, 0.95);
                            return new ToolStatsByName(
                                    toolName,
                                    runs,
                                    successRuns,
                                    failedRuns,
                                    percent(successRuns, runs),
                                    avgDuration,
                                    p95);
                        })
                .sorted(
                        Comparator.comparingLong(ToolStatsByName::runs)
                                .reversed()
                                .thenComparing(ToolStatsByName::toolName))
                .limit(8)
                .toList();
    }

    private List<ToolDurationBucket> buildBuckets(List<ToolAudit> audits) {
        long le500 = audits.stream().filter(a -> a.getDurationMs() <= 500).count();
        long le1000 =
                audits.stream()
                        .filter(a -> a.getDurationMs() > 500 && a.getDurationMs() <= 1_000)
                        .count();
        long le3000 =
                audits.stream()
                        .filter(a -> a.getDurationMs() > 1_000 && a.getDurationMs() <= 3_000)
                        .count();
        long gt3000 = audits.stream().filter(a -> a.getDurationMs() > 3_000).count();

        List<ToolDurationBucket> buckets = new ArrayList<>();
        buckets.add(new ToolDurationBucket("<=500ms", le500));
        buckets.add(new ToolDurationBucket("500ms-1s", le1000));
        buckets.add(new ToolDurationBucket("1s-3s", le3000));
        buckets.add(new ToolDurationBucket(">3s", gt3000));
        return buckets;
    }

    private List<ToolDurationBucket> defaultBuckets() {
        return List.of(
                new ToolDurationBucket("<=500ms", 0),
                new ToolDurationBucket("500ms-1s", 0),
                new ToolDurationBucket("1s-3s", 0),
                new ToolDurationBucket(">3s", 0));
    }

    private boolean isSuccess(ToolAudit audit) {
        return audit.getStatus() != null && audit.getStatus().equalsIgnoreCase("success");
    }

    private long percentile(List<Long> sortedDurations, double percentile) {
        if (sortedDurations == null || sortedDurations.isEmpty()) {
            return 0;
        }
        int index = (int) Math.ceil(percentile * sortedDurations.size()) - 1;
        int safeIndex = Math.max(0, Math.min(sortedDurations.size() - 1, index));
        return sortedDurations.get(safeIndex);
    }

    private double percent(long numerator, long denominator) {
        if (denominator <= 0) {
            return 0.0;
        }
        double raw = numerator * 100.0 / denominator;
        return Math.round(raw * 10.0) / 10.0;
    }
}
