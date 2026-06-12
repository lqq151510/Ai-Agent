package com.agent.mvp.system.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.system.dto.ModelsResponse;
import com.agent.mvp.system.dto.ReadinessCheck;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

class SystemDiagnosticsServiceTest {

    @Test
    void listModelsShouldFallbackToConfiguredDefaultWhenModelCatalogUnavailable() {
        AppProperties appProperties = new AppProperties();
        appProperties.setDefaultProvider(ModelProviderType.OPENAI);
        appProperties.setDefaultOpenaiModel("qwen/qwen3.5-9b");
        SystemDiagnosticsService service =
                new SystemDiagnosticsService(
                        appProperties, mock(JdbcTemplate.class), mock(StringRedisTemplate.class));

        ModelsResponse response = service.listModels();

        assertEquals(ModelProviderType.OPENAI, response.defaultProvider());
        assertEquals("qwen/qwen3.5-9b", response.defaultModel());
        assertTrue(response.fallbackUsed());
        assertEquals(0, response.availableCount());
        assertEquals(1, response.options().size());
        assertTrue(response.options().get(0).isDefault());
        assertFalse(response.options().get(0).available());
        assertEquals("openai", response.options().get(0).providerId());
    }

    @Test
    void checkDatabaseShouldExposeStructuredFailureDetails() {
        AppProperties appProperties = new AppProperties();
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject("SELECT 1", Integer.class))
                .thenThrow(new IllegalStateException("db down"));
        SystemDiagnosticsService service =
                new SystemDiagnosticsService(
                        appProperties, jdbcTemplate, mock(StringRedisTemplate.class));

        ReadinessCheck check = service.checkDatabase();

        assertFalse(check.ok());
        assertEquals("DATABASE_UNAVAILABLE", check.code());
        assertTrue(check.latencyMs() != null && check.latencyMs() >= 0);
        assertEquals("SELECT 1", check.metadata().get("query"));
    }
}
