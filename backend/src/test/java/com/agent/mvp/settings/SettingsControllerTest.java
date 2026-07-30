package com.agent.mvp.settings;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.settings.dto.SettingsBackupPayload;
import com.agent.mvp.settings.dto.SettingsBackupPreferences;
import com.agent.mvp.settings.service.SettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SettingsControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private SettingsService settingsService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        settingsService = mock(SettingsService.class);
        mockMvc =
                MockMvcBuilders.standaloneSetup(new SettingsController(settingsService))
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(
                                new MappingJackson2HttpMessageConverter(objectMapper),
                                new StringHttpMessageConverter())
                        .build();
    }

    @Test
    void exportShouldUseGetAndReturnBackupJson() throws Exception {
        UUID userId = UUID.randomUUID();
        when(settingsService.exportBackup(userId))
                .thenReturn(
                        new SettingsBackupPayload(
                                1,
                                Instant.parse("2026-07-29T08:00:00Z"),
                                new SettingsBackupPreferences("泽宝", null, "manual", "local_first"),
                                List.of(),
                                List.of(),
                                false));

        mockMvc.perform(get("/api/v1/settings/export").principal(authentication(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.modelSourcesIncluded").value(false));

        verify(settingsService).exportBackup(userId);
    }

    @Test
    void malformedImportShouldReturnBadRequestWithoutCallingService() throws Exception {
        UUID userId = UUID.randomUUID();
        String invalidPayload =
                """
{
  "schemaVersion": 1,
  "exportedAt": "2026-07-29T08:00:00Z",
  "preferences": {"organizeMode": "manual", "privacyMode": "local_first"},
  "tags": [{"id": "not-a-uuid", "name": "rag", "createdAt": "2026-07-29T08:00:00Z"}],
  "knowledgeItems": [],
  "modelSourcesIncluded": false
}
""";

        mockMvc.perform(
                        post("/api/v1/settings/import")
                                .principal(authentication(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(invalidPayload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));

        verifyNoInteractions(settingsService);
    }

    private Authentication authentication(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId, "user@example.com"), null);
    }
}
