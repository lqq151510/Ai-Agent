package com.agent.mvp.ingestion;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.ingestion.dto.IngestionJobResponse;
import com.agent.mvp.ingestion.service.IngestionJobService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class IngestionJobControllerTest {

    private IngestionJobService ingestionJobService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ingestionJobService = mock(IngestionJobService.class);
        mockMvc =
                MockMvcBuilders.standaloneSetup(new IngestionJobController(ingestionJobService))
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(
                                new MappingJackson2HttpMessageConverter(),
                                new StringHttpMessageConverter())
                        .build();
    }

    @Test
    void listShouldBindLimitAndKnowledgeItemIdForAuthenticatedUser() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID knowledgeItemId = UUID.randomUUID();
        IngestionJobResponse response =
                new IngestionJobResponse(
                        UUID.randomUUID(),
                        knowledgeItemId,
                        "import",
                        "succeeded",
                        null,
                        null,
                        null,
                        null,
                        null,
                        null);
        when(ingestionJobService.list(eq(userId), eq(25), eq(knowledgeItemId), eq(null), eq(null)))
                .thenReturn(List.of(response));

        mockMvc.perform(
                        get("/api/v1/ingestion-jobs")
                                .principal(authentication(userId))
                                .param("limit", "25")
                                .param("knowledgeItemId", knowledgeItemId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("succeeded"));

        verify(ingestionJobService).list(userId, 25, knowledgeItemId, null, null);
    }

    @Test
    void listShouldRejectMalformedKnowledgeItemIdWithoutCallingService() throws Exception {
        mockMvc.perform(
                        get("/api/v1/ingestion-jobs")
                                .principal(authentication(UUID.randomUUID()))
                                .param("knowledgeItemId", "not-a-uuid"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(ingestionJobService);
    }

    private Authentication authentication(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId, "user@example.com"), null);
    }
}
