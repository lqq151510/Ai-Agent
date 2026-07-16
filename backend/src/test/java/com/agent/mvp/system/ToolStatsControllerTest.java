package com.agent.mvp.system;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.tooling.dto.ToolStatsResponse;
import com.agent.mvp.tooling.service.ToolAuditService;
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

class ToolStatsControllerTest {

    private ToolAuditService toolAuditService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        toolAuditService = mock(ToolAuditService.class);
        ToolStatsController controller = new ToolStatsController(toolAuditService);
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
    void testGetStats() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        ToolStatsResponse mockResponse =
                new ToolStatsResponse(
                        24,
                        10L,
                        8L,
                        2L,
                        80.0,
                        150L,
                        100L,
                        400L,
                        500L,
                        List.of(),
                        List.of(),
                        Instant.now());

        when(toolAuditService.stats(eq(userId), eq(24), eq(sessionId))).thenReturn(mockResponse);

        mockMvc.perform(
                        get("/api/v1/system/tool-stats")
                                .principal(auth)
                                .param("windowHours", "24")
                                .param("sessionId", sessionId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.windowHours").value(24))
                .andExpect(jsonPath("$.totalRuns").value(10))
                .andExpect(jsonPath("$.successRuns").value(8));
    }

    @Test
    void testExportStatsJson() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        ToolStatsResponse mockResponse =
                new ToolStatsResponse(
                        24,
                        10L,
                        8L,
                        2L,
                        80.0,
                        150L,
                        100L,
                        400L,
                        500L,
                        List.of(),
                        List.of(),
                        Instant.now());

        when(toolAuditService.stats(eq(userId), eq(24), eq(sessionId))).thenReturn(mockResponse);

        mockMvc.perform(
                        get("/api/v1/system/tool-stats/export")
                                .principal(auth)
                                .param("windowHours", "24")
                                .param("sessionId", sessionId.toString())
                                .param("format", "json"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"tool-stats.json\""))
                .andExpect(jsonPath("$.totalRuns").value(10));
    }

    @Test
    void testExportStatsMarkdown() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        when(toolAuditService.statsMarkdown(eq(userId), eq(24), eq(sessionId)))
                .thenReturn("# Markdown Stats");

        mockMvc.perform(
                        get("/api/v1/system/tool-stats/export")
                                .principal(auth)
                                .param("windowHours", "24")
                                .param("sessionId", sessionId.toString())
                                .param("format", "markdown"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"tool-stats.md\""));
    }
}
