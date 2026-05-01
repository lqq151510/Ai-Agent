package com.agent.mvp.system.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.system.dto.ModelOption;
import com.agent.mvp.system.dto.ModelsResponse;
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
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
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
                                    StringRedisTemplate redisTemplate) {
        this.appProperties = appProperties;
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
    }

    public ModelsResponse listModels() {
        List<ModelOption> options = new ArrayList<>();
        Set<String> openaiModels = fetchOpenAiModels();

        for (String model : openaiModels) {
            options.add(new ModelOption(
                    ModelProviderType.OPENAI,
                    model,
                    ModelProviderType.OPENAI == appProperties.getDefaultProvider()
                            && model.equals(appProperties.getDefaultOpenaiModel())
            ));
        }

        if (options.isEmpty()) {
            options.add(new ModelOption(
                    appProperties.getDefaultProvider(),
                    defaultModelFor(appProperties.getDefaultProvider()),
                    true
            ));
        }

        return new ModelsResponse(
                appProperties.getDefaultProvider(),
                defaultModelFor(appProperties.getDefaultProvider()),
                options,
                Instant.now()
        );
    }

    public ReadinessResponse readiness() {
        List<ReadinessCheck> checks = List.of(
                checkDatabase(),
                checkRedis(),
                checkModelProvider()
        );
        boolean ready = checks.stream().allMatch(ReadinessCheck::ok);
        return new ReadinessResponse(ready, checks, Instant.now());
    }

    public ReadinessCheck checkModelProvider() {
        return switch (appProperties.getDefaultProvider()) {
            case OPENAI -> {
                Set<String> models = fetchOpenAiModels();
                if (models.isEmpty()) {
                    yield new ReadinessCheck("model", false, "OpenAI-compatible endpoint unreachable or empty model list");
                }
                yield new ReadinessCheck("model", true, "OpenAI-compatible endpoint reachable");
            }
        };
    }

    public ReadinessCheck checkDatabase() {
        try {
            Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            boolean ok = result != null && result == 1;
            return new ReadinessCheck("database", ok, ok ? "ok" : "unexpected query result");
        } catch (Exception ex) {
            return new ReadinessCheck("database", false, sanitize(ex.getMessage()));
        }
    }

    public ReadinessCheck checkRedis() {
        try {
            String pong = null;
            if (redisTemplate.getConnectionFactory() != null) {
                try (RedisConnection connection = redisTemplate.getConnectionFactory().getConnection()) {
                    pong = connection.ping();
                }
            }
            boolean ok = pong != null && "PONG".equalsIgnoreCase(pong);
            return new ReadinessCheck("redis", ok, ok ? "ok" : "ping failed");
        } catch (Exception ex) {
            return new ReadinessCheck("redis", false, sanitize(ex.getMessage()));
        }
    }

    @SuppressWarnings("unchecked")
    private Set<String> fetchOpenAiModels() {
        String baseUrl = appProperties.getOpenai().getBaseUrl();
        String apiKey = appProperties.getOpenai().getApiKey();
        if (baseUrl == null || baseUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
            return Set.of();
        }

        return withRetrySet(() -> {
            Map<String, Object> payload = buildClient(baseUrl).get()
                    .uri("/models")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(probeTimeout())
                    .block();

            if (payload == null || !(payload.get("data") instanceof List<?> list)) {
                return Set.<String>of();
            }
            return list.stream()
                    .filter(Map.class::isInstance)
                    .map(Map.class::cast)
                    .map(item -> item.get("id"))
                    .filter(Objects::nonNull)
                    .map(String::valueOf)
                    .filter(s -> !s.isBlank())
                    .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
        });
    }

    private Set<String> withRetrySet(Supplier<Set<String>> call) {
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
        }
        return Set.of();
    }

    private WebClient buildClient(String baseUrl) {
        int connectTimeoutMs = (int) Math.max(500, appProperties.getModelRuntime().getConnectTimeoutMs());
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, connectTimeoutMs)
                .responseTimeout(probeTimeout());
        return WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    private Duration probeTimeout() {
        return Duration.ofMillis(Math.max(500, appProperties.getStartupValidation().getModelProbeTimeoutMs()));
    }

    private String defaultModelFor(ModelProviderType provider) {
        return appProperties.getDefaultOpenaiModel();
    }

    private String sanitize(String text) {
        if (text == null || text.isBlank()) {
            return "unknown";
        }
        return text.length() > 240 ? text.substring(0, 240) + "..." : text;
    }
}
