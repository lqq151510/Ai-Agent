package com.agent.mvp.config;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.system.service.SystemDiagnosticsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.function.Function;

@Component
public class StartupValidationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupValidationRunner.class);

    private final AppProperties appProperties;
    private final SystemDiagnosticsService diagnosticsService;
    private final Function<String, String> envReader;

    public StartupValidationRunner(AppProperties appProperties,
                                   SystemDiagnosticsService diagnosticsService) {
        this(appProperties, diagnosticsService, System::getenv);
    }

    StartupValidationRunner(AppProperties appProperties,
                            SystemDiagnosticsService diagnosticsService,
                            Function<String, String> envReader) {
        this.appProperties = appProperties;
        this.diagnosticsService = diagnosticsService;
        this.envReader = envReader;
    }

    @Override
    public void run(ApplicationArguments args) {
        validateJwtSecret();
        validateModelConfig();
        validateDatabase();
        validateRedis();
        validateModelEndpoint();
    }

    private void validateJwtSecret() {
        String jwtSecret = envReader.apply("JWT_SECRET");
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("JWT_SECRET environment variable is required and must be at least 32 characters.");
        }
        if (jwtSecret.length() < 32) {
            throw new IllegalStateException("JWT_SECRET environment variable must be at least 32 characters.");
        }
    }

    private void validateModelConfig() {
        if (appProperties.getDefaultProvider() == ModelProviderType.OPENAI) {
            String apiKey = appProperties.getOpenai().getApiKey();
            String baseUrl = appProperties.getOpenai().getBaseUrl();
            String model = appProperties.getDefaultOpenaiModel();
            if (apiKey == null || apiKey.isBlank()) {
                throw new IllegalStateException("OPENAI_API_KEY is required when app.default-provider=OPENAI");
            }
            if (baseUrl == null || baseUrl.isBlank()) {
                throw new IllegalStateException("OPENAI_BASE_URL is required when app.default-provider=OPENAI");
            }
            if (model == null || model.isBlank()) {
                throw new IllegalStateException("OPENAI_MODEL is required when app.default-provider=OPENAI");
            }
            return;
        }

        String baseUrl = appProperties.getOllama().getBaseUrl();
        String model = appProperties.getDefaultOllamaModel();
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalStateException("OLLAMA_BASE_URL is required when app.default-provider=OLLAMA");
        }
        if (model == null || model.isBlank()) {
            throw new IllegalStateException("OLLAMA_MODEL is required when app.default-provider=OLLAMA");
        }
    }

    private void validateDatabase() {
        ReadinessCheck check = diagnosticsService.checkDatabase();
        if (!check.ok()) {
            throw new IllegalStateException("Database connectivity check failed: " + check.detail());
        }
    }

    private void validateRedis() {
        ReadinessCheck check = diagnosticsService.checkRedis();
        if (!check.ok()) {
            throw new IllegalStateException("Redis connectivity check failed: " + check.detail());
        }
    }

    private void validateModelEndpoint() {
        ReadinessCheck check = diagnosticsService.checkModelProvider();
        if (check.ok()) {
            return;
        }

        if (appProperties.getStartupValidation().isFailFast()) {
            throw new IllegalStateException("Model provider readiness check failed: " + check.detail());
        }

        log.warn("Model provider readiness check failed but fail-fast disabled: {}", check.detail());
    }
}
