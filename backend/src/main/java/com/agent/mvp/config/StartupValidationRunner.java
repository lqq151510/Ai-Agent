package com.agent.mvp.config;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.system.service.SystemDiagnosticsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import org.springframework.core.env.Environment;
import java.util.function.Supplier;

@Component
public class StartupValidationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupValidationRunner.class);

    private final AppProperties appProperties;
    private final SystemDiagnosticsService diagnosticsService;
    private final Environment env;

    @Autowired
    public StartupValidationRunner(AppProperties appProperties,
                                   SystemDiagnosticsService diagnosticsService,
                                   Environment env) {
        this.appProperties = appProperties;
        this.diagnosticsService = diagnosticsService;
        this.env = env;
    }

    @Override
    public void run(ApplicationArguments args) {
        validateRequiredConfiguration();
        validateRequiredDependencies();
        validateOptionalDependencies();
    }

    private void validateRequiredConfiguration() {
        validateJwtSecret();
        validateModelConfig();
    }

    private void validateRequiredDependencies() {
        validateRequiredDependency("database", diagnosticsService::checkDatabase,
                "Database connectivity check failed: ");
        validateRequiredDependency("redis", diagnosticsService::checkRedis,
                "Redis connectivity check failed: ");
    }

    private void validateOptionalDependencies() {
        validateOptionalModelProvider();
    }

    private void validateRequiredDependency(String dependencyName,
                                            Supplier<ReadinessCheck> checkSupplier,
                                            String errorPrefix) {
        ReadinessCheck check = checkSupplier.get();
        if (!check.ok()) {
            throw new IllegalStateException(errorPrefix + check.detail());
        }
        log.info("Startup required dependency check passed: {} ({})", dependencyName, check.detail());
    }

    private void validateJwtSecret() {
        String jwtSecret = env.getProperty("security.jwt.secret");
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("JWT_SECRET or security.jwt.secret is required and must be at least 32 characters.");
        }
        if (jwtSecret.length() < 32) {
            throw new IllegalStateException("JWT_SECRET or security.jwt.secret must be at least 32 characters.");
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
        }
    }

    private void validateOptionalModelProvider() {
        ReadinessCheck check = diagnosticsService.checkModelProvider();
        if (check.ok()) {
            log.info("Startup optional dependency check passed: model provider ({})", check.detail());
            return;
        }

        if (appProperties.getStartupValidation().isFailFast()) {
            throw new IllegalStateException("Model provider readiness check failed: " + check.detail());
        }

        log.warn("Startup optional dependency check failed but fail-fast disabled: model provider ({})", check.detail());
    }
}
