package com.agent.mvp.agent.provider;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.tooling.ToolCall;
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
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.stream.Collectors;

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
        String apiKey = resolveApiKey();

        Instant start = Instant.now();
        Map<String, Object> body = Map.of(
                "model", request.model(),
                "messages", request.messages().stream().map(this::toMap).toList(),
                "temperature", 0.2,
                "tools", toToolsPayload(request),
                "tool_choice", request.toolChoice() == null ? "auto" : request.toolChoice()
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
        List<ToolCall> toolCalls = extractToolCalls(message);
        String finishReason = String.valueOf(choice.getOrDefault("finish_reason", ""));

        return new ModelChatResponse(content, Duration.between(start, Instant.now()).toMillis(), toolCalls, finishReason);
    }

    @Override
    @SuppressWarnings("unchecked")
    public ModelChatResponse stream(ModelChatRequest request, Consumer<String> chunkConsumer) {
        String apiKey = resolveApiKey();

        Instant start = Instant.now();
        StringBuilder content = new StringBuilder();
        Map<String, Object> body = Map.of(
                "model", request.model(),
                "messages", request.messages().stream().map(this::toMap).toList(),
                "temperature", 0.2,
                "stream", true,
                "tools", toToolsPayload(request),
                "tool_choice", request.toolChoice() == null ? "auto" : request.toolChoice()
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

        return new ModelChatResponse(content.toString(), Duration.between(start, Instant.now()).toMillis(), List.of(), "stop");
    }

    private Map<String, Object> toMap(ModelChatMessage message) {
        Map<String, Object> map = new HashMap<>();
        map.put("role", message.role());
        map.put("content", message.content() == null ? "" : message.content());
        if (message.name() != null && !message.name().isBlank()) {
            map.put("name", message.name());
        }
        if (message.toolCallId() != null && !message.toolCallId().isBlank()) {
            map.put("tool_call_id", message.toolCallId());
        }
        if (message.toolCalls() != null && !message.toolCalls().isEmpty()) {
            List<Map<String, Object>> toolCalls = message.toolCalls().stream()
                    .map(call -> Map.of(
                            "id", call.id(),
                            "type", "function",
                            "function", Map.of(
                                    "name", call.name(),
                                    "arguments", call.argumentsJson() == null ? "{}" : call.argumentsJson()
                            )
                    ))
                    .collect(Collectors.toList());
            map.put("tool_calls", toolCalls);
        }
        return map;
    }

    private List<Map<String, Object>> toToolsPayload(ModelChatRequest request) {
        if (request.tools() == null || request.tools().isEmpty()) {
            return List.of();
        }
        return request.tools().stream()
                .map(spec -> Map.of(
                        "type", "function",
                        "function", Map.of(
                                "name", spec.name(),
                                "description", spec.description(),
                                "parameters", spec.inputJsonSchema()
                        )
                ))
                .toList();
    }

    private String truncate(String text) {
        if (text == null || text.isBlank()) {
            return "no response body";
        }
        return text.length() > 240 ? text.substring(0, 240) + "..." : text;
    }

    @SuppressWarnings("unchecked")
    private List<ToolCall> extractToolCalls(Map<String, Object> message) {
        if (message == null) {
            return List.of();
        }
        List<Map<String, Object>> raw = (List<Map<String, Object>>) message.get("tool_calls");
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        return raw.stream().map(item -> {
            Map<String, Object> function = (Map<String, Object>) item.get("function");
            String id = String.valueOf(item.getOrDefault("id", ""));
            String name = function == null ? "" : String.valueOf(function.getOrDefault("name", ""));
            String args = function == null ? "{}" : String.valueOf(function.getOrDefault("arguments", "{}"));
            return new ToolCall(id, name, args);
        }).toList();
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
            if (delta == null) {
                return "";
            }
            Object content = delta.get("content");
            if (content != null && !content.toString().isEmpty()) {
                return content.toString();
            }
            Object reasoning = delta.get("reasoning_content");
            if (reasoning != null && !reasoning.toString().isEmpty()) {
                return reasoning.toString();
            }
            return "";
        } catch (Exception ex) {
            return "";
        }
    }

    private String resolveApiKey() {
        String apiKey = appProperties.getOpenai().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            if (isLocalOrMockEndpoint(baseUrl)) {
                return "sk-local-mock-placeholder";
            }
            throw new BadRequestException("OPENAI_API_KEY is not configured");
        }
        return apiKey;
    }

    private boolean isLocalOrMockEndpoint(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        String lower = url.toLowerCase();
        return lower.contains("localhost")
                || lower.contains("127.0.0.1")
                || lower.contains("0.0.0.0")
                || lower.contains("host.docker.internal")
                || lower.contains("192.168.")
                || lower.contains("10.");
    }
}
