package com.agent.mvp.system.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.system.dto.ModelOption;
import com.agent.mvp.system.dto.ModelsResponse;
import com.agent.mvp.system.dto.ProviderOption;
import com.agent.mvp.system.dto.ReadinessCheck;
import com.agent.mvp.system.dto.ReadinessResponse;
import io.netty.channel.ChannelOption;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

@Service
public class SystemDiagnosticsService {

    private static final Logger log = LoggerFactory.getLogger(SystemDiagnosticsService.class);

    private final AppProperties appProperties;
    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;

    public SystemDiagnosticsService(AppProperties appProperties,
                                    JdbcTemplate jdbcTemplate,
                                    @Autowired(required = false) StringRedisTemplate redisTemplate) {
        this.appProperties = appProperties;
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
    }

    public ModelsResponse listModels() {
        List<ModelOption> options = new ArrayList<>();
        ModelCatalogProbe openAiProbe = fetchOpenAiModels();
        String defaultModel = defaultModelFor(appProperties.getDefaultProvider());

        for (String model : openAiProbe.models()) {
            options.add(new ModelOption(
                    ModelProviderType.OPENAI,
                    model,
                    ModelProviderType.OPENAI == appProperties.getDefaultProvider()
                            && model.equals(defaultModel),
                    ModelProviderType.OPENAI.providerId(),
                    ModelProviderType.OPENAI.displayName(),
                    ModelProviderType.OPENAI.apiStyle(),
                    ModelProviderType.OPENAI.openAiCompatible(),
                    true
            ));
        }

        boolean hasDefaultModel = options.stream()
                .anyMatch(option -> option.provider() == appProperties.getDefaultProvider() && option.model().equals(defaultModel));
        boolean fallbackUsed = options.isEmpty();
        if (!hasDefaultModel) {
            options.add(new ModelOption(
                    appProperties.getDefaultProvider(),
                    defaultModel,
                    true,
                    appProperties.getDefaultProvider().providerId(),
                    appProperties.getDefaultProvider().displayName(),
                    appProperties.getDefaultProvider().apiStyle(),
                    appProperties.getDefaultProvider().openAiCompatible(),
                    false
            ));
        }

        return new ModelsResponse(
                appProperties.getDefaultProvider(),
                defaultModel,
                List.of(new ProviderOption(
                        ModelProviderType.OPENAI,
                        ModelProviderType.OPENAI.providerId(),
                        ModelProviderType.OPENAI.displayName(),
                        ModelProviderType.OPENAI.apiStyle(),
                        ModelProviderType.OPENAI.openAiCompatible(),
                        ModelProviderType.OPENAI == appProperties.getDefaultProvider()
                )),
                options,
                openAiProbe.models().size(),
                fallbackUsed,
                openAiProbe.detail(),
                Instant.now()
        );
    }

    public ReadinessResponse readiness() {
        ReadinessCheck dbCheck = checkDatabase();
        ReadinessCheck redisCheck = checkRedis();
        ReadinessCheck modelCheck = checkModelProvider();

        List<ReadinessCheck> checks = List.of(dbCheck, redisCheck, modelCheck);
        // Database and Redis are hard dependencies. Model check is a soft/degradable dependency.
        boolean ready = dbCheck.ok() && redisCheck.ok();
        return new ReadinessResponse(ready, checks, Instant.now());
    }

    public ReadinessCheck checkModelProvider() {
        return switch (appProperties.getDefaultProvider()) {
            case OPENAI -> {
                ModelCatalogProbe probe = fetchOpenAiModels();
                Map<String, String> metadata = new LinkedHashMap<>();
                metadata.put("provider", ModelProviderType.OPENAI.providerId());
                metadata.put("apiStyle", ModelProviderType.OPENAI.apiStyle());
                metadata.put("baseUrl", sanitize(appProperties.getOpenai().getBaseUrl()));
                metadata.put("defaultModel", defaultModelFor(ModelProviderType.OPENAI));
                metadata.put("discoveredModels", String.valueOf(probe.models().size()));
                if (probe.models().isEmpty()) {
                    yield new ReadinessCheck(
                            "model",
                            false,
                            probe.detail(),
                            "MODEL_PROVIDER_UNAVAILABLE",
                            probe.latencyMs(),
                            metadata
                    );
                }
                yield new ReadinessCheck(
                        "model",
                        true,
                        probe.detail(),
                        "OK",
                        probe.latencyMs(),
                        metadata
                );
            }
            case VERTEXAI -> {
                Map<String, String> metadata = new LinkedHashMap<>();
                metadata.put("provider", ModelProviderType.VERTEXAI.providerId());
                metadata.put("apiStyle", ModelProviderType.VERTEXAI.apiStyle());
                metadata.put("defaultModel", defaultModelFor(ModelProviderType.VERTEXAI));
                yield new ReadinessCheck(
                        "model",
                        true,
                        "Vertex AI endpoint configured",
                        "OK",
                        0L,
                        metadata
                );
            }
        };
    }

    public ReadinessCheck checkDatabase() {
        Instant start = Instant.now();
        try {
            Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            boolean ok = result != null && result == 1;
            return new ReadinessCheck(
                    "database",
                    ok,
                    ok ? "ok" : "unexpected query result",
                    ok ? "OK" : "DATABASE_UNEXPECTED_RESULT",
                    Duration.between(start, Instant.now()).toMillis(),
                    Map.of("query", "SELECT 1")
            );
        } catch (Exception ex) {
            return new ReadinessCheck(
                    "database",
                    false,
                    sanitize(ex.getMessage()),
                    "DATABASE_UNAVAILABLE",
                    Duration.between(start, Instant.now()).toMillis(),
                    Map.of("query", "SELECT 1")
            );
        }
    }

    public ReadinessCheck checkRedis() {
        if (redisTemplate == null) {
            return new ReadinessCheck(
                    "redis",
                    true,
                    "redis is disabled (using memory cache)",
                    "OK",
                    0L,
                    Map.of()
            );
        }
        Instant start = Instant.now();
        try {
            String pong = null;
            if (redisTemplate.getConnectionFactory() != null) {
                try (RedisConnection connection = redisTemplate.getConnectionFactory().getConnection()) {
                    pong = connection.ping();
                }
            }
            boolean ok = pong != null && "PONG".equalsIgnoreCase(pong);
            return new ReadinessCheck(
                    "redis",
                    ok,
                    ok ? "ok" : "ping failed",
                    ok ? "OK" : "REDIS_PING_FAILED",
                    Duration.between(start, Instant.now()).toMillis(),
                    Map.of("ping", pong == null ? "" : pong)
            );
        } catch (Exception ex) {
            return new ReadinessCheck(
                    "redis",
                    false,
                    sanitize(ex.getMessage()),
                    "REDIS_UNAVAILABLE",
                    Duration.between(start, Instant.now()).toMillis(),
                    Map.of()
            );
        }
    }

    @SuppressWarnings("unchecked")
    private ModelCatalogProbe fetchOpenAiModels() {
        String baseUrl = appProperties.getOpenai().getBaseUrl();
        String apiKey = appProperties.getOpenai().getApiKey();
        if (baseUrl == null || baseUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
            return new ModelCatalogProbe(Set.of(), "OpenAI-compatible endpoint is not configured", 0L);
        }

        Instant start = Instant.now();
        return withRetryProbe(() -> {
            Map<String, Object> payload = WebClient.create().get()
                    .uri(baseUrl + "/models")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(probeTimeout())
                    .block();

            if (payload == null || !(payload.get("data") instanceof List<?> list)) {
                return new ModelCatalogProbe(
                        Set.of(),
                        "OpenAI-compatible /models returned an empty payload",
                        Duration.between(start, Instant.now()).toMillis()
                );
            }
            Set<String> models = list.stream()
                    .filter(Map.class::isInstance)
                    .map(Map.class::cast)
                    .map(item -> item.get("id"))
                    .filter(Objects::nonNull)
                    .map(String::valueOf)
                    .filter(s -> !s.isBlank())
                    .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
            String detail = models.isEmpty()
                    ? "OpenAI-compatible endpoint reachable but returned no models"
                    : "OpenAI-compatible endpoint reachable: discovered " + models.size() + " model(s)";
            return new ModelCatalogProbe(models, detail, Duration.between(start, Instant.now()).toMillis());
        });
    }

    private ModelCatalogProbe withRetryProbe(Supplier<ModelCatalogProbe> call) {
        int retries = Math.max(0, appProperties.getStartupValidation().getModelProbeRetries());
        RuntimeException last = null;
        for (int attempt = 0; attempt <= retries; attempt++) {
            try {
                return call.get();
            } catch (RuntimeException ex) {
                last = ex;
            }
        }
        if (last != null) {
            log.debug("Model probe failed after retries", last);
            return new ModelCatalogProbe(Set.of(), sanitize(last.getMessage()), 0L);
        }
        return new ModelCatalogProbe(Set.of(), "Model probe failed without a captured exception", 0L);
    }

    

    private Duration probeTimeout() {
        return Duration.ofMillis(Math.max(500, appProperties.getStartupValidation().getModelProbeTimeoutMs()));
    }

    private String defaultModelFor(ModelProviderType provider) {
        return appProperties.getDefaultModel(provider);
    }

    private String sanitize(String text) {
        if (text == null || text.isBlank()) {
            return "unknown";
        }
        return text.length() > 240 ? text.substring(0, 240) + "..." : text;
    }

    private record ModelCatalogProbe(Set<String> models, String detail, long latencyMs) {
    }
}
