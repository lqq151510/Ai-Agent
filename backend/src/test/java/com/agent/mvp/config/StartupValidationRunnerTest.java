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
        when(diagnosticsService.checkDatabase()).thenReturn(new ReadinessCheck("database", true, "ok"));
        when(diagnosticsService.checkRedis()).thenReturn(new ReadinessCheck("redis", true, "ok"));
        when(diagnosticsService.checkModelProvider()).thenReturn(new ReadinessCheck("model", true, "ok"));

        StartupValidationRunner runner = new StartupValidationRunner(
                new AppProperties(),
                diagnosticsService,
                ignored -> "01234567890123456789012345678901"
        );

        assertDoesNotThrow(() -> runner.run(mock(ApplicationArguments.class)));
        verify(diagnosticsService).checkDatabase();
        verify(diagnosticsService).checkRedis();
        verify(diagnosticsService).checkModelProvider();
    }
}
