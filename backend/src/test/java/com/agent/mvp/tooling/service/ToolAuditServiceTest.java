package com.agent.mvp.tooling.service;

import com.agent.mvp.tooling.dto.ToolStatsResponse;
import com.agent.mvp.tooling.entity.ToolAudit;
import com.agent.mvp.tooling.repo.ToolAuditRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ToolAuditServiceTest {

    @Mock
    private ToolAuditRepository toolAuditRepository;

    @InjectMocks
    private ToolAuditService toolAuditService;

    @Test
    void shouldReturnEmptyStatsWhenNoData() {
        UUID userId = UUID.randomUUID();
        when(toolAuditRepository.findByUserIdAndCreatedAtAfterOrderByCreatedAtDesc(eq(userId), any()))
                .thenReturn(List.of());

        ToolStatsResponse stats = toolAuditService.stats(userId, 24, null);

        assertEquals(24, stats.windowHours());
        assertEquals(0, stats.totalRuns());
        assertEquals(0, stats.successRuns());
        assertEquals(0, stats.failedRuns());
        assertEquals(0.0, stats.successRate());
        assertEquals(4, stats.durationBuckets().size());
    }

    @Test
    void shouldAggregateStatsForUserWindow() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        List<ToolAudit> rows = List.of(
                row(userId, sessionId, "searchCode", "success", 320),
                row(userId, sessionId, "searchCode", "success", 880),
                row(userId, sessionId, "readFile", "error", 1280),
                row(userId, sessionId, "readFile", "success", 3580)
        );

        when(toolAuditRepository.findByUserIdAndCreatedAtAfterOrderByCreatedAtDesc(eq(userId), any()))
                .thenReturn(rows);

        ToolStatsResponse stats = toolAuditService.stats(userId, 24, null);

        assertEquals(4, stats.totalRuns());
        assertEquals(3, stats.successRuns());
        assertEquals(1, stats.failedRuns());
        assertEquals(75.0, stats.successRate());
        assertEquals(1515, stats.averageDurationMs());
        assertEquals(880, stats.p50DurationMs());
        assertEquals(3580, stats.p95DurationMs());
        assertEquals(2, stats.topTools().size());
        assertTrue(stats.topTools().stream().anyMatch(item ->
                "searchCode".equals(item.toolName()) && item.runs() == 2 && item.successRate() == 100.0));
        assertTrue(stats.topTools().stream().anyMatch(item ->
                "readFile".equals(item.toolName()) && item.runs() == 2 && item.successRate() == 50.0));
    }

    private ToolAudit row(UUID userId, UUID sessionId, String toolName, String status, long durationMs) {
        ToolAudit audit = new ToolAudit();
        audit.setUserId(userId);
        audit.setSessionId(sessionId);
        audit.setToolName(toolName);
        audit.setStatus(status);
        audit.setDurationMs(durationMs);
        audit.setProvider("OPENAI");
        audit.setModel("qwen/qwen3.5-9b");
        audit.setCreatedAt(Instant.now());
        return audit;
    }
}
