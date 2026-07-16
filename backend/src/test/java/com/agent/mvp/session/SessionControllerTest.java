package com.agent.mvp.session;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.common.dto.PageResult;
import com.agent.mvp.session.dto.*;
import com.agent.mvp.session.service.SessionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SessionControllerTest {

    private SessionService sessionService;
    private MockMvc mockMvc;
    private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        sessionService = mock(SessionService.class);
        SessionController sessionController = new SessionController(sessionService);
        mockMvc =
                MockMvcBuilders.standaloneSetup(sessionController)
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
    void testCreateSessionSuccess() throws Exception {
        UUID userId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        CreateSessionRequest request =
                new CreateSessionRequest(
                        "My New Session",
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        "chat",
                        "goal",
                        "planned",
                        2000);

        SessionResponse mockResponse =
                new SessionResponse(
                        UUID.randomUUID(),
                        "My New Session",
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        "chat",
                        "goal",
                        "planned",
                        2000,
                        Instant.now(),
                        Instant.now());

        when(sessionService.createSession(eq(userId), any(CreateSessionRequest.class)))
                .thenReturn(mockResponse);

        mockMvc.perform(
                        post("/api/v1/sessions")
                                .principal(auth)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("My New Session"))
                .andExpect(jsonPath("$.contextTokenLimit").value(2000));
    }

    @Test
    void testListSessionsSuccess() throws Exception {
        UUID userId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        SessionResponse sessionResp =
                new SessionResponse(
                        UUID.randomUUID(),
                        "Title",
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        "chat",
                        "goal",
                        "planned",
                        2000,
                        Instant.now(),
                        Instant.now());
        PageResult<SessionResponse> pageResult =
                new PageResult<>(List.of(sessionResp), 0, 10, 1L, 1);

        when(sessionService.listSessions(userId, 0, 20)).thenReturn(pageResult);

        mockMvc.perform(
                        get("/api/v1/sessions")
                                .principal(auth)
                                .param("page", "0")
                                .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].title").value("Title"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void testListMessagesSuccess() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        MessageResponse msg =
                new MessageResponse(
                        UUID.randomUUID(), "user", "hi", "trace", "openai", "gpt-4", Instant.now());

        when(sessionService.listMessages(userId, sessionId)).thenReturn(List.of(msg));

        mockMvc.perform(get("/api/v1/sessions/{sessionId}/messages", sessionId).principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].content").value("hi"));
    }

    @Test
    void testUpdateContextTokenLimit() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        UpdateSessionContextTokenLimitRequest request =
                new UpdateSessionContextTokenLimitRequest(3000);
        SessionResponse mockResponse =
                new SessionResponse(
                        sessionId,
                        "Title",
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        "chat",
                        "goal",
                        "planned",
                        3000,
                        Instant.now(),
                        Instant.now());

        when(sessionService.updateContextTokenLimit(userId, sessionId, 3000))
                .thenReturn(mockResponse);

        mockMvc.perform(
                        patch("/api/v1/sessions/{sessionId}/context-token-limit", sessionId)
                                .principal(auth)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contextTokenLimit").value(3000));
    }

    @Test
    void testUpdateWorkflow() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        UpdateSessionWorkflowRequest request =
                new UpdateSessionWorkflowRequest("chat", "goal", "in_progress");
        SessionResponse mockResponse =
                new SessionResponse(
                        sessionId,
                        "Title",
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        "chat",
                        "goal",
                        "in_progress",
                        2000,
                        Instant.now(),
                        Instant.now());

        when(sessionService.updateWorkflow(userId, sessionId, "chat", "goal", "in_progress"))
                .thenReturn(mockResponse);

        mockMvc.perform(
                        patch("/api/v1/sessions/{sessionId}/workflow", sessionId)
                                .principal(auth)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskType").value("chat"))
                .andExpect(jsonPath("$.taskStatus").value("in_progress"));
    }

    @Test
    void testExportSessionJson() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        SessionResponse mockResponse =
                new SessionResponse(
                        sessionId,
                        "Title",
                        ModelProviderType.OPENAI,
                        "gpt-4",
                        "chat",
                        "goal",
                        "planned",
                        2000,
                        Instant.now(),
                        Instant.now());
        SessionExportResponse exportResponse =
                new SessionExportResponse(mockResponse, List.of(), Instant.now());

        when(sessionService.exportSession(userId, sessionId)).thenReturn(exportResponse);

        mockMvc.perform(
                        get("/api/v1/sessions/{sessionId}/export", sessionId)
                                .principal(auth)
                                .param("format", "json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.title").value("Title"));
    }

    @Test
    void testExportSessionMarkdown() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        when(sessionService.exportSessionMarkdown(userId, sessionId))
                .thenReturn("# Markdown Session");

        mockMvc.perform(
                        get("/api/v1/sessions/{sessionId}/export", sessionId)
                                .principal(auth)
                                .param("format", "markdown"))
                .andExpect(status().isOk())
                .andExpect(status().isOk())
                .andExpect(
                        result -> {
                            String disposition =
                                    result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION);
                            org.junit.jupiter.api.Assertions.assertNotNull(disposition);
                            org.junit.jupiter.api.Assertions.assertTrue(
                                    disposition.contains("session-"));
                            org.junit.jupiter.api.Assertions.assertTrue(
                                    disposition.contains(".md"));
                        });
    }

    @Test
    void testDeleteSession() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Authentication auth = getMockAuthentication(userId);

        mockMvc.perform(delete("/api/v1/sessions/{sessionId}", sessionId).principal(auth))
                .andExpect(status().isNoContent());

        verify(sessionService).deleteSession(userId, sessionId);
    }
}
