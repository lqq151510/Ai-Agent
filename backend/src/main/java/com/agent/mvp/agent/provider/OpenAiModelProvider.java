package com.agent.mvp.agent.provider;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netty.channel.ChannelOption;
import org.springframework.http.HttpHeaders;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

@Component
public class OpenAiModelProvider implements ModelProvider {

    private final AppProperties appProperties;
    private final String baseUrl;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final Duration totalTimeout;
    private final int idempotentRetries;

    public OpenAiModelProvider(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.baseUrl = appProperties.getOpenai().getBaseUrl();
        this.objectMapper = objectMapper;
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
        return ModelProviderType.OPENAI;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ModelChatResponse chat(ModelChatRequest request) {
        String apiKey = appProperties.getOpenai().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new BadRequestException("OPENAI_API_KEY is not configured");
        }

        Instant start = Instant.now();
        Map<String, Object> body = Map.of(
                "model", request.model(),
                "messages", request.messages().stream().map(this::toMap).toList(),
                "temperature", 0.2
        );

        Map<String, Object> response;
        try {
            response = withIdempotentRetry(() -> webClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(totalTimeout)
                    .block());
        } catch (WebClientRequestException ex) {
            throw new BadRequestException("Cannot connect to OpenAI at " + baseUrl);
        } catch (WebClientResponseException ex) {
            throw new BadRequestException("OpenAI request failed: HTTP "
                    + ex.getStatusCode().value()
                    + " - "
                    + truncate(ex.getResponseBodyAsString()));
        }

        if (response == null) {
            throw new BadRequestException("OpenAI response is empty");
        }

        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
        if (choices == null || choices.isEmpty()) {
            throw new BadRequestException("OpenAI response choices are empty");
        }

        Map<String, Object> choice = choices.get(0);
        Map<String, Object> message = (Map<String, Object>) choice.get("message");
        String content = message == null ? "" : String.valueOf(message.getOrDefault("content", ""));

        return new ModelChatResponse(content, Duration.between(start, Instant.now()).toMillis());
    }

    @Override
    @SuppressWarnings("unchecked")
    public ModelChatResponse stream(ModelChatRequest request, Consumer<String> chunkConsumer) {
        String apiKey = appProperties.getOpenai().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new BadRequestException("OPENAI_API_KEY is not configured");
        }

        Instant start = Instant.now();
        StringBuilder content = new StringBuilder();
        Map<String, Object> body = Map.of(
                "model", request.model(),
                "messages", request.messages().stream().map(this::toMap).toList(),
                "temperature", 0.2,
                "stream", true
        );

        try {
            webClient.post()
                    .uri("/chat/completions")
                    .accept(MediaType.TEXT_EVENT_STREAM)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
                    .timeout(totalTimeout)
                    .doOnNext(event -> {
                        String data = event.data();
                        if (data == null || data.isBlank() || "[DONE]".equals(data)) {
                            return;
                        }
                        String chunk = extractOpenAiChunk(data);
                        if (!chunk.isEmpty()) {
                            content.append(chunk);
                            chunkConsumer.accept(chunk);
                        }
                    })
                    .blockLast();
        } catch (WebClientRequestException ex) {
            throw new BadRequestException("Cannot connect to OpenAI at " + baseUrl);
        } catch (WebClientResponseException ex) {
            throw new BadRequestException("OpenAI request failed: HTTP "
                    + ex.getStatusCode().value()
                    + " - "
                    + truncate(ex.getResponseBodyAsString()));
        }

        return new ModelChatResponse(content.toString(), Duration.between(start, Instant.now()).toMillis());
    }

    private Map<String, Object> toMap(ModelChatMessage message) {
        return Map.of("role", message.role(), "content", message.content());
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

    @SuppressWarnings("unchecked")
    private String extractOpenAiChunk(String data) {
        try {
            Map<String, Object> event = objectMapper.readValue(data, new TypeReference<>() {});
            List<Map<String, Object>> choices = (List<Map<String, Object>>) event.get("choices");
            if (choices == null || choices.isEmpty()) {
                return "";
            }
            Map<String, Object> delta = (Map<String, Object>) choices.get(0).get("delta");
            if (delta == null || delta.get("content") == null) {
                return "";
            }
            return String.valueOf(delta.get("content"));
        } catch (Exception ex) {
            return "";
        }
    }
}
