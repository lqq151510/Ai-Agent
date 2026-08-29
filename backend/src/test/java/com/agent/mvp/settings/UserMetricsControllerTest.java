package com.agent.mvp.settings;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.modelsource.dto.UserMetricsResponse;
import com.agent.mvp.modelsource.service.ModelUsageService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class UserMetricsControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private ModelUsageService modelUsageService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        modelUsageService = mock(ModelUsageService.class);
        mockMvc =
                MockMvcBuilders.standaloneSetup(new UserMetricsController(modelUsageService))
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
                        .build();
    }

    @Test
    void getMetricsShouldReturnRealStats() throws Exception {
        UUID userId = UUID.randomUUID();
        when(modelUsageService.getMetrics(userId))
                .thenReturn(
                        new UserMetricsResponse(
                                12500L,
                                5200L,
                                7300L,
                                3400L,
                                42L,
                                41L,
                                1L,
                                97.6,
                                320L,
                                3,
                                2,
                                0.0152,
                                0.0021,
                                Map.of("deepseek", 8000L, "openai", 4500L),
                                List.of(
                                        new UserMetricsResponse.ModelUsageItemDto(
                                                UUID.randomUUID(),
                                                UUID.randomUUID(),
                                                "deepseek",
                                                "deepseek-chat",
                                                200,
                                                400,
                                                600,
                                                280L,
                                                "success",
                                                null,
                                                Instant.now()))));

        Authentication auth =
                new UsernamePasswordAuthenticationToken(
                        new AuthenticatedUser(userId, "zebao@agent.local"), null);

        mockMvc.perform(get("/api/v1/user/metrics").principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalTokens").value(12500))
                .andExpect(jsonPath("$.todayTokens").value(3400))
                .andExpect(jsonPath("$.totalCalls").value(42))
                .andExpect(jsonPath("$.successRate").value(97.6))
                .andExpect(jsonPath("$.totalModelSources").value(3))
                .andExpect(jsonPath("$.activeModelSources").value(2))
                .andExpect(jsonPath("$.estimatedCostCny").value(0.0152))
                .andExpect(jsonPath("$.estimatedCostUsd").value(0.0021))
                .andExpect(jsonPath("$.recentLogs[0].modelName").value("deepseek-chat"));
    }
}
