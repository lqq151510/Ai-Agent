package com.agent.mvp.agent.provider;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netty.channel.ChannelOption;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.netty.http.client.HttpClient;

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
        long connectTimeoutMs =
                Math.max(500, appProperties.getModelRuntime().getConnectTimeoutMs());
        Duration readTimeout =
                Duration.ofMillis(
                        Math.max(1_000, appProperties.getModelRuntime().getReadTimeoutMs()));
        this.totalTimeout =
                Duration.ofMillis(
                        Math.max(1_000, appProperties.getModelRuntime().getTotalTimeoutMs()));
        this.idempotentRetries =
                Math.max(0, appProperties.getModelRuntime().getIdempotentRetries());
        HttpClient httpClient =
                HttpClient.create()
                        // Custom local model sources must never be redirected to another host.
                        .followRedirect(false)
                        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) connectTimeoutMs)
                        .responseTimeout(readTimeout);
        this.webClient =
                WebClient.builder()
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
    public ModelChatResponse chat(ModelChatRequest request) {
        String apiKey = resolveApiKey(request);
        String requestUrl = resolveBaseUrl(request) + "/chat/completions";
        Duration requestTimeout = resolveRequestTimeout(request);

        Instant start = Instant.now();
        Map<String, Object> body =
                Map.of(
                        "model", request.model(),
                        "messages", request.messages().stream().map(this::toMap).toList(),
                        "temperature", 0.2,
                        "tools", toToolsPayload(request),
                        "tool_choice",
                                request.toolChoice() == null ? "auto" : request.toolChoice());

        JsonNode response;
        try {
            response =
                    withIdempotentRetry(
                            () ->
                                    webClient
                                            .post()
                                            .uri(requestUrl)
                                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                                            .bodyValue(body)
                                            .retrieve()
                                            .bodyToMono(JsonNode.class)
                                            .timeout(requestTimeout)
                                            .block());
        } catch (WebClientRequestException ex) {
            throw new BadRequestException("Cannot connect to OpenAI at " + baseUrl);
        } catch (WebClientResponseException ex) {
            throw new BadRequestException(
                    "OpenAI request failed: HTTP "
                            + ex.getStatusCode().value()
                            + " - "
                            + truncate(ex.getResponseBodyAsString()));
        }

        if (response == null) {
            throw new BadRequestException("OpenAI response is empty");
        }

        JsonNode choices = response.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            throw new BadRequestException("OpenAI response choices are empty");
        }

        JsonNode choice = choices.get(0);
        JsonNode message = choice.path("message");
        String content = message.path("content").isNull() ? "" : message.path("content").asText();
        List<ToolCall> toolCalls = extractToolCalls(message);
        String finishReason = choice.path("finish_reason").asText("");

        return new ModelChatResponse(
                content,
                Duration.between(start, Instant.now()).toMillis(),
                toolCalls,
                finishReason);
    }

    @Override
    public ModelChatResponse stream(ModelChatRequest request, Consumer<String> chunkConsumer) {
        String apiKey = resolveApiKey(request);
        String requestUrl = resolveBaseUrl(request) + "/chat/completions";
        Duration requestTimeout = resolveRequestTimeout(request);

        Instant start = Instant.now();
        StringBuilder content = new StringBuilder();
        Map<String, Object> body =
                Map.of(
                        "model",
                        request.model(),
                        "messages",
                        request.messages().stream().map(this::toMap).toList(),
                        "temperature",
                        0.2,
                        "stream",
                        true,
                        "tools",
                        toToolsPayload(request),
                        "tool_choice",
                        request.toolChoice() == null ? "auto" : request.toolChoice());

        try {
            webClient
                    .post()
                    .uri(requestUrl)
                    .accept(MediaType.TEXT_EVENT_STREAM)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
                    .timeout(requestTimeout)
                    .doOnNext(
                            event -> {
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
            throw new BadRequestException(
                    "OpenAI request failed: HTTP "
                            + ex.getStatusCode().value()
                            + " - "
                            + truncate(ex.getResponseBodyAsString()));
        }

        return new ModelChatResponse(
                content.toString(),
                Duration.between(start, Instant.now()).toMillis(),
                List.of(),
                "stop");
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
            List<Map<String, Object>> toolCalls =
                    message.toolCalls().stream()
                            .map(
                                    call ->
                                            Map.of(
                                                    "id", call.id(),
                                                    "type", "function",
                                                    "function",
                                                            Map.of(
                                                                    "name",
                                                                    call.name(),
                                                                    "arguments",
                                                                    call.argumentsJson() == null
                                                                            ? "{}"
                                                                            : call
                                                                                    .argumentsJson())))
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
                .map(
                        spec ->
                                Map.of(
                                        "type",
                                        "function",
                                        "function",
                                        Map.of(
                                                "name", spec.name(),
                                                "description", spec.description(),
                                                "parameters", spec.inputJsonSchema())))
                .toList();
    }

    private String truncate(String text) {
        if (text == null || text.isBlank()) {
            return "no response body";
        }
        return text.length() > 240 ? text.substring(0, 240) + "..." : text;
    }

    private List<ToolCall> extractToolCalls(JsonNode message) {
        if (message == null || message.isMissingNode() || message.isNull()) {
            return List.of();
        }
        JsonNode toolCallsNode = message.path("tool_calls");
        if (!toolCallsNode.isArray() || toolCallsNode.isEmpty()) {
            return List.of();
        }
        return java.util.stream.StreamSupport.stream(toolCallsNode.spliterator(), false)
                .map(
                        item -> {
                            JsonNode function = item.path("function");
                            String id = item.path("id").asText("");
                            String name = function.path("name").asText("");
                            String args = function.path("arguments").asText("{}");
                            return new ToolCall(id, name, args);
                        })
                .toList();
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

    private String extractOpenAiChunk(String data) {
        try {
            JsonNode event = objectMapper.readTree(data);
            JsonNode choices = event.path("choices");
            if (choices.isEmpty() || !choices.isArray()) {
                return "";
            }
            JsonNode delta = choices.get(0).path("delta");
            if (delta.isMissingNode()) {
                return "";
            }
            JsonNode content = delta.path("content");
            if (!content.isMissingNode() && !content.isNull() && !content.asText().isEmpty()) {
                return content.asText();
            }
            JsonNode reasoning = delta.path("reasoning_content");
            if (!reasoning.isMissingNode()
                    && !reasoning.isNull()
                    && !reasoning.asText().isEmpty()) {
                return reasoning.asText();
            }
            return "";
        } catch (Exception ex) {
            return "";
        }
    }

    private String resolveBaseUrl(ModelChatRequest request) {
        if (request.customBaseUrl() != null && !request.customBaseUrl().isBlank()) {
            return request.customBaseUrl();
        }
        return this.baseUrl;
    }

    private Duration resolveRequestTimeout(ModelChatRequest request) {
        Long requestedTimeoutMs = request.timeoutMs();
        if (requestedTimeoutMs == null || requestedTimeoutMs <= 0) {
            return totalTimeout;
        }
        return Duration.ofMillis(
                Math.min(totalTimeout.toMillis(), Math.max(1_000L, requestedTimeoutMs)));
    }

    private String resolveApiKey(ModelChatRequest request) {
        if (request.customApiKey() != null && !request.customApiKey().isBlank()) {
            return request.customApiKey();
        }
        String apiKey = appProperties.getOpenai().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            if (isLocalOrMockEndpoint(resolveBaseUrl(request))) {
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
                || lower.matches(".*\\b10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b.*");
    }
}
