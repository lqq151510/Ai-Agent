package com.agent.mvp.system.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.system.dto.ModelOption;
import com.agent.mvp.system.dto.ModelsResponse;
import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.system.dto.ReadinessResponse;
import com.agent.mvp.system.dto.ReleaseReportResponse;
import com.agent.mvp.tooling.dto.ToolDurationBucket;
import com.agent.mvp.tooling.dto.ToolStatsResponse;
import com.agent.mvp.tooling.service.ToolAuditService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReleaseReportServiceTest {

    @Mock
    private SystemDiagnosticsService diagnosticsService;

    @Mock
    private ToolAuditService toolAuditService;

    @InjectMocks
    private ReleaseReportService releaseReportService;

    @Test
    void shouldBuildReleaseReport() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        ReadinessResponse readiness = new ReadinessResponse(
                true,
                List.of(new ReadinessCheck("database", true, "ok")),
                Instant.now()
        );
        ModelsResponse models = new ModelsResponse(
                ModelProviderType.OPENAI,
                "qwen/qwen3.5-9b",
                List.of(new ModelOption(ModelProviderType.OPENAI, "qwen/qwen3.5-9b", true)),
                Instant.now()
        );
        ToolStatsResponse stats = new ToolStatsResponse(
                24,
                10,
                9,
                1,
                90.0,
                450,
                300,
                900,
                1200,
                List.of(new ToolDurationBucket("<=500ms", 8)),
                List.of(),
                Instant.now()
        );

        when(diagnosticsService.readiness()).thenReturn(readiness);
        when(diagnosticsService.listModels()).thenReturn(models);
        when(toolAuditService.stats(userId, 24, sessionId)).thenReturn(stats);

        ReleaseReportResponse report = releaseReportService.build(userId, 24, sessionId);

        assertEquals(24, report.windowHours());
        assertEquals(sessionId, report.sessionId());
        assertEquals(10, report.toolStats().totalRuns());
        assertTrue(report.readiness().ready());
    }

    @Test
    void shouldRenderMarkdown() {
        UUID userId = UUID.randomUUID();

        ReadinessResponse readiness = new ReadinessResponse(
                true,
                List.of(new ReadinessCheck("model", true, "ok")),
                Instant.now()
        );
        ModelsResponse models = new ModelsResponse(
                ModelProviderType.OPENAI,
                "qwen/qwen3.5-9b",
                List.of(new ModelOption(ModelProviderType.OPENAI, "qwen/qwen3.5-9b", true)),
                Instant.now()
        );
        ToolStatsResponse stats = new ToolStatsResponse(
                24,
                1,
                1,
                0,
                100.0,
                120,
                120,
                120,
                120,
                List.of(new ToolDurationBucket("<=500ms", 1)),
                List.of(),
                Instant.now()
        );

        when(diagnosticsService.readiness()).thenReturn(readiness);
        when(diagnosticsService.listModels()).thenReturn(models);
        when(toolAuditService.stats(userId, 24, null)).thenReturn(stats);

        String markdown = releaseReportService.buildMarkdown(userId, 24, null);

        assertTrue(markdown.contains("# Release Report"));
        assertTrue(markdown.contains("## Readiness"));
        assertTrue(markdown.contains("## Models"));
        assertTrue(markdown.contains("## Tool Stats"));
    }
}
