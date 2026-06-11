package com.agent.mvp.config;

import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.system.service.SystemDiagnosticsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;

import java.lang.reflect.Constructor;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class StartupValidationRunnerTest {

    @Test
    void shouldMarkProductionConstructorForSpringInjection() {
        boolean hasAutowiredConstructor = Arrays.stream(StartupValidationRunner.class.getDeclaredConstructors())
                .filter(this::isProductionConstructor)
                .anyMatch(constructor -> constructor.isAnnotationPresent(Autowired.class));

        assertTrue(hasAutowiredConstructor, "Spring needs an explicit constructor when test-only constructors exist");
    }

    @Test
    void shouldFailFastWhenJwtSecretEnvIsMissing() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        StartupValidationRunner runner = new StartupValidationRunner(
                new AppProperties(),
                diagnosticsService,
                mockEnv(null)
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
                mockEnv("short-secret")
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
                mockEnv("01234567890123456789012345678901")
        );

        assertDoesNotThrow(() -> runner.run(mock(ApplicationArguments.class)));
        verify(diagnosticsService).checkDatabase();
        verify(diagnosticsService).checkRedis();
        verify(diagnosticsService).checkModelProvider();
    }

    @Test
    void shouldPassWhenModelProviderCheckFailsAndFailFastDisabled() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        when(diagnosticsService.checkDatabase()).thenReturn(readinessCheck("database", true, "ok"));
        when(diagnosticsService.checkRedis()).thenReturn(readinessCheck("redis", true, "ok"));
        when(diagnosticsService.checkModelProvider()).thenReturn(readinessCheck("model", false, "mock not available"));
        AppProperties appProperties = new AppProperties();
        appProperties.getOpenai().setApiKey("sk-test");
        appProperties.getOpenai().setBaseUrl("http://localhost:1234/v1");
        appProperties.setDefaultOpenaiModel("qwen/qwen3.5-9b");
        appProperties.getStartupValidation().setFailFast(false);

        StartupValidationRunner runner = new StartupValidationRunner(
                appProperties,
                diagnosticsService,
                mockEnv("01234567890123456789012345678901")
        );

        assertDoesNotThrow(() -> runner.run(mock(ApplicationArguments.class)));
        verify(diagnosticsService).checkDatabase();
        verify(diagnosticsService).checkRedis();
        verify(diagnosticsService).checkModelProvider();
    }

    @Test
    void shouldFailWhenModelProviderCheckFailsAndFailFastEnabled() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        when(diagnosticsService.checkDatabase()).thenReturn(readinessCheck("database", true, "ok"));
        when(diagnosticsService.checkRedis()).thenReturn(readinessCheck("redis", true, "ok"));
        when(diagnosticsService.checkModelProvider()).thenReturn(readinessCheck("model", false, "mock not available"));
        AppProperties appProperties = new AppProperties();
        appProperties.getOpenai().setApiKey("sk-test");
        appProperties.getOpenai().setBaseUrl("http://localhost:1234/v1");
        appProperties.setDefaultOpenaiModel("qwen/qwen3.5-9b");
        appProperties.getStartupValidation().setFailFast(true);

        StartupValidationRunner runner = new StartupValidationRunner(
                appProperties,
                diagnosticsService,
                mockEnv("01234567890123456789012345678901")
        );

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> runner.run(mock(ApplicationArguments.class)));
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().contains("Model provider readiness check failed"));
        verify(diagnosticsService).checkDatabase();
        verify(diagnosticsService).checkRedis();
        verify(diagnosticsService).checkModelProvider();
    }

    @Test
    void shouldFailWhenRequiredDependencyCheckFails() {
        SystemDiagnosticsService diagnosticsService = mock(SystemDiagnosticsService.class);
        when(diagnosticsService.checkDatabase()).thenReturn(readinessCheck("database", false, "db down"));
        AppProperties appProperties = new AppProperties();
        appProperties.getOpenai().setApiKey("sk-test");
        appProperties.getOpenai().setBaseUrl("http://localhost:1234/v1");
        appProperties.setDefaultOpenaiModel("qwen/qwen3.5-9b");

        StartupValidationRunner runner = new StartupValidationRunner(
                appProperties,
                diagnosticsService,
                mockEnv("01234567890123456789012345678901")
        );

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> runner.run(mock(ApplicationArguments.class)));
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().contains("Database connectivity check failed"));
        verify(diagnosticsService).checkDatabase();
        verify(diagnosticsService, never()).checkRedis();
        verify(diagnosticsService, never()).checkModelProvider();
    }

    private ReadinessCheck readinessCheck(String name, boolean ok, String detail) {
        return new ReadinessCheck(name, ok, detail, ok ? "OK" : "ERROR", 1L, java.util.Map.of());
    }

    private boolean isProductionConstructor(Constructor<?> constructor) {
        Class<?>[] parameterTypes = constructor.getParameterTypes();
        return parameterTypes.length == 3
                && parameterTypes[0] == AppProperties.class
                && parameterTypes[1] == SystemDiagnosticsService.class
                && parameterTypes[2] == org.springframework.core.env.Environment.class;
    }

    private org.springframework.core.env.Environment mockEnv(String secret) {
        org.springframework.core.env.Environment env = mock(org.springframework.core.env.Environment.class);
        when(env.getProperty("security.jwt.secret")).thenReturn(secret);
        return env;
    }
}
