package com.agent.mvp.agent.provider;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.config.AppProperties;
import io.netty.channel.ChannelOption;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

@Component
public class OllamaModelProvider implements ModelProvider {

    private final String baseUrl;
    private final WebClient webClient;
    private final Duration totalTimeout;
    private final int idempotentRetries;

    public OllamaModelProvider(AppProperties appProperties) {
        this.baseUrl = appProperties.getOllama().getBaseUrl();
        long connectTimeoutMs = Math.max(500, appProperties.getModelRuntime().getConnectTimeoutMs());
        Duration readTimeout = Duration.ofMillis(Math.max(1_000, appProperties.getModelRuntime().getReadTimeoutMs()));
        this.totalTimeout = Duration.ofMillis(Math.max(1_000, appProperties.getModelRuntime().getTotalTimeoutMs()));
        this.idempotentRetries = Math.max(0, appProperties.getModelRuntime().getIdempotentRetries());
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) connectTimeoutMs)
                .responseTimeout(readTimeout);
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    @Override
    public ModelProviderType type() {
        return ModelProviderType.OLLAMA;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ModelChatResponse chat(ModelChatRequest request) {
        Instant start = Instant.now();
        Map<String, Object> body = Map.of(
                "model", request.model(),
                "messages", request.messages().stream().map(this::toMap).toList(),
                "stream", false
        );

        Map<String, Object> response;
        try {
            response = withIdempotentRetry(() -> webClient.post()
                    .uri("/api/chat")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(totalTimeout)
                    .block());
        } catch (WebClientRequestException ex) {
            throw new BadRequestException("Cannot connect to Ollama at " + baseUrl + ". Please ensure Ollama is running.");
        } catch (WebClientResponseException ex) {
            throw new BadRequestException("Ollama request failed: HTTP "
                    + ex.getStatusCode().value()
                    + " - "
                    + truncate(ex.getResponseBodyAsString()));
        }

        if (response == null) {
            throw new BadRequestException("Ollama response is empty");
        }

        Map<String, Object> message = (Map<String, Object>) response.get("message");
        String content = message == null ? "" : String.valueOf(message.getOrDefault("content", ""));

        return new ModelChatResponse(content, Duration.between(start, Instant.now()).toMillis());
    }

    @Override
    @SuppressWarnings("unchecked")
    public ModelChatResponse stream(ModelChatRequest request, Consumer<String> chunkConsumer) {
        Instant start = Instant.now();
        StringBuilder content = new StringBuilder();
        Map<String, Object> body = Map.of(
                "model", request.model(),
                "messages", request.messages().stream().map(this::toMap).toList(),
                "stream", true
        );

        try {
            webClient.post()
                    .uri("/api/chat")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToFlux(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .timeout(totalTimeout)
                    .doOnNext(event -> {
                        Map<String, Object> message = (Map<String, Object>) event.get("message");
                        if (message == null || message.get("content") == null) {
                            return;
                        }
                        String chunk = String.valueOf(message.get("content"));
                        if (!chunk.isEmpty()) {
                            content.append(chunk);
                            chunkConsumer.accept(chunk);
                        }
                    })
                    .blockLast();
        } catch (WebClientRequestException ex) {
            throw new BadRequestException("Cannot connect to Ollama at " + baseUrl + ". Please ensure Ollama is running.");
        } catch (WebClientResponseException ex) {
            throw new BadRequestException("Ollama request failed: HTTP "
                    + ex.getStatusCode().value()
                    + " - "
                    + truncate(ex.getResponseBodyAsString()));
        }

        return new ModelChatResponse(content.toString(), Duration.between(start, Instant.now()).toMillis());
    }

    private Map<String, Object> toMap(ModelChatMessage message) {
        Map<String, Object> map = new HashMap<>();
        map.put("role", message.role());
        map.put("content", message.content());
        if (message.name() != null && !message.name().isBlank()) {
            map.put("name", message.name());
        }
        return map;
    }

    private String truncate(String text) {
        if (text == null || text.isBlank()) {
            return "no response body";
        }
        return text.length() > 240 ? text.substring(0, 240) + "..." : text;
    }

    private <T> T withIdempotentRetry(Supplier<T> call) {
        RuntimeException last = null;
        for (int attempt = 0; attempt <= idempotentRetries; attempt++) {
            try {
                return call.get();
            } catch (WebClientRequestException ex) {
                last = ex;
            } catch (WebClientResponseException ex) {
                if (!isRetryableStatus(ex.getStatusCode().value())) {
                    throw ex;
                }
                last = ex;
            }

            if (attempt < idempotentRetries) {
                backoff(attempt);
            }
        }

        if (last != null) {
            throw last;
        }
        throw new IllegalStateException("Retry failed without captured exception");
    }

    private boolean isRetryableStatus(int status) {
        return status == 408 || status == 429 || status >= 500;
    }

    private void backoff(int attempt) {
        try {
            long sleepMs = Math.min(1_200L, 200L * (attempt + 1));
            Thread.sleep(sleepMs);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
