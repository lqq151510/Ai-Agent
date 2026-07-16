package com.agent.mvp.system;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.system.dto.ModelsResponse;
import com.agent.mvp.system.dto.ReadinessResponse;
import com.agent.mvp.system.dto.ReleaseReportResponse;
import com.agent.mvp.system.service.ReleaseReportService;
import com.agent.mvp.tooling.dto.ToolStatsResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ReleaseReportControllerTest {

    private ReleaseReportService releaseReportService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        releaseReportService = mock(ReleaseReportService.class);
        ReleaseReportController controller = new ReleaseReportController(releaseReportService);
        mockMvc =
                MockMvcBuilders.standaloneSetup(controller)
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(
                                new MappingJackson2HttpMessageConverter(),
                                new StringHttpMessageConverter())
                        .build();
    }

    private Authentication getMockAuthentication(UUID userId) {
        AuthenticatedUser principal = new AuthenticatedUser(userId, "test@example.com");
        return new UsernamePasswordAuthenticationToken(principal, null);
    }

    @Test
    void testGetReport() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        ReadinessResponse readiness = new ReadinessResponse(true, List.of(), Instant.now());
        ModelsResponse models =
                new ModelsResponse(
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        List.of(),
                        List.of(),
                        1,
                        false,
                        "ok",
                        Instant.now());
        ToolStatsResponse toolStats =
                new ToolStatsResponse(
                        24, 0L, 0L, 0L, 0.0, 0L, 0L, 0L, 0L, List.of(), List.of(), Instant.now());
        ReleaseReportResponse mockResponse =
                new ReleaseReportResponse(
                        24, sessionId, readiness, models, toolStats, Instant.now());

        when(releaseReportService.build(eq(userId), eq(24), eq(sessionId)))
                .thenReturn(mockResponse);

        mockMvc.perform(
                        get("/api/v1/system/release-report")
                                .principal(auth)
                                .param("windowHours", "24")
                                .param("sessionId", sessionId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.windowHours").value(24))
                .andExpect(jsonPath("$.readiness.ready").value(true));
    }

    @Test
    void testExportReportJson() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        ReadinessResponse readiness = new ReadinessResponse(true, List.of(), Instant.now());
        ModelsResponse models =
                new ModelsResponse(
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        List.of(),
                        List.of(),
                        1,
                        false,
                        "ok",
                        Instant.now());
        ToolStatsResponse toolStats =
                new ToolStatsResponse(
                        24, 0L, 0L, 0L, 0.0, 0L, 0L, 0L, 0L, List.of(), List.of(), Instant.now());
        ReleaseReportResponse mockResponse =
                new ReleaseReportResponse(
                        24, sessionId, readiness, models, toolStats, Instant.now());

        when(releaseReportService.build(eq(userId), eq(24), eq(sessionId)))
                .thenReturn(mockResponse);

        mockMvc.perform(
                        get("/api/v1/system/release-report/export")
                                .principal(auth)
                                .param("windowHours", "24")
                                .param("sessionId", sessionId.toString())
                                .param("format", "json"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"release-report.json\""))
                .andExpect(jsonPath("$.windowHours").value(24));
    }

    @Test
    void testExportReportMarkdown() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        when(releaseReportService.buildMarkdown(eq(userId), eq(24), eq(sessionId)))
                .thenReturn("# Markdown Report");

        mockMvc.perform(
                        get("/api/v1/system/release-report/export")
                                .principal(auth)
                                .param("windowHours", "24")
                                .param("sessionId", sessionId.toString())
                                .param("format", "markdown"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"release-report.md\""));
    }
}
