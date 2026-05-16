package com.agent.mvp.config;

import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.system.service.SystemDiagnosticsService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class StartupValidationRunnerTest {

    @Test
    void shouldFailFastWhenJwtSecretEnvIsMissing() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        StartupValidationRunner runner = new StartupValidationRunner(
                new AppProperties(),
                diagnosticsService,
                ignored -> null
        );

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> runner.run(mock(ApplicationArguments.class)));

        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().contains("JWT_SECRET"));
        verifyNoInteractions(diagnosticsService);
    }

    @Test
    void shouldFailFastWhenJwtSecretEnvTooShort() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        StartupValidationRunner runner = new StartupValidationRunner(
                new AppProperties(),
                diagnosticsService,
                ignored -> "short-secret"
        );

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> runner.run(mock(ApplicationArguments.class)));

        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().contains("JWT_SECRET"));
        verifyNoInteractions(diagnosticsService);
    }

    @Test
    void shouldPassWhenJwtSecretValidAndReadinessChecksPass() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        when(diagnosticsService.checkDatabase()).thenReturn(readinessCheck("database", true, "ok"));
        when(diagnosticsService.checkRedis()).thenReturn(readinessCheck("redis", true, "ok"));
        when(diagnosticsService.checkModelProvider()).thenReturn(readinessCheck("model", true, "ok"));
        AppProperties appProperties = new AppProperties();
        appProperties.getOpenai().setApiKey("sk-test");
        appProperties.getOpenai().setBaseUrl("http://localhost:1234/v1");
        appProperties.setDefaultOpenaiModel("qwen/qwen3.5-9b");

        StartupValidationRunner runner = new StartupValidationRunner(
                appProperties,
                diagnosticsService,
                ignored -> "01234567890123456789012345678901"
        );

        assertDoesNotThrow(() -> runner.run(mock(ApplicationArguments.class)));
        verify(diagnosticsService).checkDatabase();
        verify(diagnosticsService).checkRedis();
        verify(diagnosticsService).checkModelProvider();
    }

    private ReadinessCheck readinessCheck(String name, boolean ok, String detail) {
        return new ReadinessCheck(name, ok, detail, ok ? "OK" : "ERROR", 1L, java.util.Map.of());
    }
}
