package com.agent.mvp.system.service;

import com.agent.mvp.system.dto.ReleaseReportResponse;
import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.tooling.dto.ToolDurationBucket;
import com.agent.mvp.tooling.dto.ToolStatsByName;
import com.agent.mvp.tooling.service.ToolAuditService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class ReleaseReportService {

    private final SystemDiagnosticsService diagnosticsService;
    private final ToolAuditService toolAuditService;

    public ReleaseReportService(SystemDiagnosticsService diagnosticsService,
                                ToolAuditService toolAuditService) {
        this.diagnosticsService = diagnosticsService;
        this.toolAuditService = toolAuditService;
    }

    public ReleaseReportResponse build(UUID userId, int windowHours, UUID sessionId) {
        int safeWindowHours = Math.max(1, Math.min(168, windowHours));
        return new ReleaseReportResponse(
                safeWindowHours,
                sessionId,
                diagnosticsService.readiness(),
                diagnosticsService.listModels(),
                toolAuditService.stats(userId, safeWindowHours, sessionId),
                Instant.now()
        );
    }

    public String buildMarkdown(UUID userId, int windowHours, UUID sessionId) {
        ReleaseReportResponse report = build(userId, windowHours, sessionId);
        StringBuilder out = new StringBuilder();

        out.append("# Release Report\n\n");
        out.append("- Generated At: ").append(report.generatedAt()).append("\n");
        out.append("- Stats Window: ").append(report.windowHours()).append("h\n");
        out.append("- Session Scope: ").append(report.sessionId() == null ? "global" : report.sessionId()).append("\n\n");

        out.append("## Readiness\n\n");
        out.append("- Ready: ").append(report.readiness().ready()).append("\n\n");
        out.append("| Check | OK | Detail |\n");
        out.append("| --- | :---: | --- |\n");
        for (ReadinessCheck check : report.readiness().checks()) {
            out.append("| ").append(check.name())
                    .append(" | ").append(check.ok())
                    .append(" | ").append(safeMd(check.detail()))
                    .append(" |\n");
        }
        out.append("\n");

        out.append("## Models\n\n");
        out.append("- Default Provider: ").append(report.models().defaultProvider()).append("\n");
        out.append("- Default Model: ").append(report.models().defaultModel()).append("\n\n");
        out.append("| Provider | Model | Default |\n");
        out.append("| --- | --- | :---: |\n");
        report.models().options().forEach(option -> out.append("| ")
                .append(option.provider())
                .append(" | ")
                .append(safeMd(option.model()))
                .append(" | ")
                .append(option.isDefault())
                .append(" |\n"));
        out.append("\n");

        out.append("## Tool Stats\n\n");
        out.append("- Total Runs: ").append(report.toolStats().totalRuns()).append("\n");
        out.append("- Success Rate: ").append(report.toolStats().successRate()).append("%\n");
        out.append("- Avg/P95 (ms): ").append(report.toolStats().averageDurationMs())
                .append(" / ").append(report.toolStats().p95DurationMs()).append("\n\n");

        out.append("### Duration Buckets\n\n");
        out.append("| Bucket | Count |\n");
        out.append("| --- | ---: |\n");
        for (ToolDurationBucket bucket : report.toolStats().durationBuckets()) {
            out.append("| ").append(bucket.label()).append(" | ").append(bucket.count()).append(" |\n");
        }
        out.append("\n");

        out.append("### Top Tools\n\n");
        out.append("| Tool | Runs | Success Rate | Avg Ms | P95 Ms |\n");
        out.append("| --- | ---: | ---: | ---: | ---: |\n");
        for (ToolStatsByName tool : report.toolStats().topTools()) {
            out.append("| ").append(safeMd(tool.toolName()))
                    .append(" | ").append(tool.runs())
                    .append(" | ").append(tool.successRate()).append("%")
                    .append(" | ").append(tool.averageDurationMs())
                    .append(" | ").append(tool.p95DurationMs())
                    .append(" |\n");
        }

        return out.toString();
    }

    private String safeMd(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("|", "\\|").replace("\n", " ");
    }
}
