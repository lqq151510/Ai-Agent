package com.agent.mvp.modelsource.service;

import com.agent.mvp.config.AppProperties;
import com.agent.mvp.modelsource.ModelSourceProviderType;
import com.agent.mvp.modelsource.dto.PromptTestResponse;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

@Service
public class ModelSourceProbeService {

    private final AppProperties appProperties;
    private final ModelUsageService modelUsageService;
    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ModelSourceProbeService(AppProperties appProperties) {
        this(appProperties, null);
    }

    @Autowired
    public ModelSourceProbeService(
            AppProperties appProperties, ModelUsageService modelUsageService) {
        this.appProperties = appProperties;
        this.modelUsageService = modelUsageService;
        // SSRF mitigation: explicitly disable redirect following
        HttpClient httpClient = HttpClient.create().followRedirect(false);
        this.webClient =
                WebClient.builder()
                        .clientConnector(new ReactorClientHttpConnector(httpClient))
                        .build();
    }

    public ProbeResult probe(ModelSource source) {
        try {
            ModelSourceProviderType providerType =
                    ModelSourceProviderType.from(source.getProviderType());
            String baseUrl = normalizeBaseUrl(source.getBaseUrl());
            String fullUrl = baseUrl + providerType.probePath();
            validateUrl(fullUrl, providerType);

            if (providerType == ModelSourceProviderType.LOCAL_COMPATIBLE) {
                return probeLocalCompatibleChat(source, fullUrl);
            }

            if (providerType.openAiCompatible()) {
                get(fullUrl)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + source.getApiKey())
                        .accept(MediaType.APPLICATION_JSON)
                        .retrieve()
                        .onStatus(
                                HttpStatusCode::is3xxRedirection,
                                response ->
                                        Mono.error(
                                                new ProbeException(
                                                        "Model endpoint returned a redirect")))
                        .onStatus(
                                status -> !status.is2xxSuccessful(),
                                response ->
                                        Mono.error(
                                                new ProbeException(
                                                        "Model endpoint returned HTTP "
                                                                + response.statusCode().value())))
                        .bodyToMono(String.class)
                        .timeout(probeTimeout())
                        .block();
                return new ProbeResult(
                        true,
                        providerType.value().toUpperCase(Locale.ROOT) + " endpoint reachable");
            }

            get(fullUrl)
                    .header("x-api-key", source.getApiKey())
                    .header("anthropic-version", "2023-06-01")
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .onStatus(
                            HttpStatusCode::is3xxRedirection,
                            response ->
                                    Mono.error(
                                            new ProbeException(
                                                    "Model endpoint returned a redirect")))
                    .onStatus(
                            status -> !status.is2xxSuccessful(),
                            response ->
                                    Mono.error(
                                            new ProbeException(
                                                    "Model endpoint returned HTTP "
                                                            + response.statusCode().value())))
                    .bodyToMono(String.class)
                    .timeout(probeTimeout())
                    .block();
            return new ProbeResult(true, "Anthropic endpoint reachable");
        } catch (IllegalArgumentException ex) {
            return new ProbeResult(false, ex.getMessage());
        } catch (Exception ex) {
            return new ProbeResult(false, classifyProbeFailure(ex));
        }
    }

    public PromptTestResponse testPrompt(ModelSource source, String userPrompt) {
        long startTime = System.currentTimeMillis();
        String prompt =
                (userPrompt == null || userPrompt.isBlank())
                        ? "你好！请用 20 字以内简短确认你的模型名称并问候。"
                        : userPrompt.trim();

        try {
            ModelSourceProviderType providerType =
                    ModelSourceProviderType.from(source.getProviderType());
            String baseUrl = normalizeBaseUrl(source.getBaseUrl());
            String chatUrl = baseUrl + "/chat/completions";
            validateUrl(chatUrl, providerType);

            String modelName =
                    source.getDefaultModel() != null && !source.getDefaultModel().isBlank()
                            ? source.getDefaultModel().trim()
                            : "gpt-3.5-turbo";

            String responseBody =
                    post(chatUrl)
                            .header(
                                    HttpHeaders.AUTHORIZATION,
                                    "Bearer " + safeApiKey(source.getApiKey()))
                            .contentType(MediaType.APPLICATION_JSON)
                            .accept(MediaType.APPLICATION_JSON)
                            .bodyValue(
                                    Map.of(
                                            "model",
                                            modelName,
                                            "messages",
                                            List.of(Map.of("role", "user", "content", prompt)),
                                            "temperature",
                                            0.7,
                                            "max_tokens",
                                            256,
                                            "stream",
                                            false))
                            .retrieve()
                            .onStatus(
                                    HttpStatusCode::is3xxRedirection,
                                    response ->
                                            Mono.error(
                                                    new ProbeException(
                                                            "Model endpoint returned a redirect")))
                            .onStatus(
                                    status -> !status.is2xxSuccessful(),
                                    response ->
                                            Mono.error(
                                                    new ProbeException(
                                                            "Model endpoint HTTP "
                                                                    + response.statusCode()
                                                                            .value())))
                            .bodyToMono(String.class)
                            .timeout(Duration.ofSeconds(20))
                            .block();

            long latencyMs = System.currentTimeMillis() - startTime;

            JsonNode root = objectMapper.readTree(responseBody);
            String reply =
                    root.path("choices")
                            .path(0)
                            .path("message")
                            .path("content")
                            .asText("（模型未返回内容）");
            JsonNode usage = root.path("usage");
            int promptTokens = usage.path("prompt_tokens").asInt(prompt.length() / 2);
            int completionTokens = usage.path("completion_tokens").asInt(reply.length() / 2);
            int totalTokens = usage.path("total_tokens").asInt(promptTokens + completionTokens);

            // Record real usage log
            if (modelUsageService != null) {
                modelUsageService.recordUsage(
                        source.getUserId(),
                        source.getId(),
                        source.getProviderType(),
                        modelName,
                        promptTokens,
                        completionTokens,
                        latencyMs,
                        "success",
                        null);
            }

            return new PromptTestResponse(
                    true,
                    reply,
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    latencyMs,
                    modelName,
                    "调用成功");
        } catch (Exception ex) {
            long latencyMs = System.currentTimeMillis() - startTime;
            String errorMsg = classifyProbeFailure(ex);

            // Record failed attempt
            if (modelUsageService != null) {
                modelUsageService.recordUsage(
                        source.getUserId(),
                        source.getId(),
                        source.getProviderType(),
                        source.getDefaultModel(),
                        prompt.length() / 2,
                        0,
                        latencyMs,
                        "failed",
                        errorMsg);
            }

            return new PromptTestResponse(
                    false, null, 0, 0, 0, latencyMs, source.getDefaultModel(), errorMsg);
        }
    }

    /**
     * Validates a source immediately before use. Cloud providers reject restricted network
     * addresses; local-compatible providers must resolve exclusively to loopback addresses.
     */
    public void validateForUse(ModelSource source) {
        if (source == null) {
            throw new IllegalArgumentException("Model source is required");
        }
        ModelSourceProviderType providerType =
                ModelSourceProviderType.from(source.getProviderType());
        validateUrl(normalizeBaseUrl(source.getBaseUrl()), providerType);
    }

    private ProbeResult probeLocalCompatibleChat(ModelSource source, String fullUrl) {
        if (source.getDefaultModel() == null || source.getDefaultModel().isBlank()) {
            return new ProbeResult(false, "Local model source default model is required");
        }

        String chatResponse =
                post(fullUrl)
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + safeApiKey(source.getApiKey()))
                        .accept(MediaType.APPLICATION_JSON)
                        .bodyValue(
                                Map.of(
                                        "model",
                                        source.getDefaultModel().trim(),
                                        "messages",
                                        List.of(
                                                Map.of(
                                                        "role",
                                                        "user",
                                                        "content",
                                                        "Reply with the single word: ok.")),
                                        "temperature",
                                        0,
                                        "max_tokens",
                                        1,
                                        "stream",
                                        false))
                        .retrieve()
                        .onStatus(
                                HttpStatusCode::is3xxRedirection,
                                response ->
                                        Mono.error(
                                                new ProbeException(
                                                        "Model endpoint returned a redirect")))
                        .onStatus(
                                status -> !status.is2xxSuccessful(),
                                response ->
                                        Mono.error(
                                                new ProbeException(
                                                        "Model endpoint returned HTTP "
                                                                + response.statusCode().value())))
                        .bodyToMono(String.class)
                        .timeout(probeTimeout())
                        .block();
        if (!isOpenAiChatResponse(chatResponse)) {
            return new ProbeResult(false, "Local model endpoint returned an invalid chat response");
        }
        return new ProbeResult(true, "Local OpenAI-compatible chat endpoint reachable");
    }

    private WebClient.RequestHeadersSpec<?> get(String url) {
        return webClient.get().uri(url);
    }

    private WebClient.RequestBodySpec post(String url) {
        return webClient.post().uri(url);
    }

    private void validateUrl(String urlString, ModelSourceProviderType providerType) {
        URI uri;
        try {
            uri = new URI(urlString);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid URL: " + e.getMessage());
        }

        String scheme = uri.getScheme();
        if (scheme == null
                || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Only http/https protocols are allowed");
        }

        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("URL must have a hostname");
        }
        if (uri.getRawUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null) {
            throw new IllegalArgumentException(
                    "URL cannot include credentials, query, or fragment");
        }

        try {
            InetAddress[] addresses = InetAddress.getAllByName(host);
            if (addresses.length == 0) {
                throw new IllegalArgumentException("Cannot resolve hostname: " + host);
            }
            if (providerType == ModelSourceProviderType.LOCAL_COMPATIBLE) {
                if (!isExplicitLoopbackHost(host)) {
                    throw new IllegalArgumentException(
                            "Local-compatible URL must use localhost, 127.0.0.1, or ::1");
                }
                for (InetAddress address : addresses) {
                    if (!address.isLoopbackAddress()) {
                        throw new IllegalArgumentException(
                                "Local-compatible URL must resolve only to loopback addresses");
                    }
                }
                return;
            }
            for (InetAddress addr : addresses) {
                if (addr.isLoopbackAddress()
                        || addr.isSiteLocalAddress()
                        || addr.isLinkLocalAddress()
                        || addr.isAnyLocalAddress()
                        || addr.isMulticastAddress()) {
                    throw new IllegalArgumentException(
                            "URL resolves to a restricted address: " + addr.getHostAddress());
                }
                // Block carrier-grade NAT (100.64.0.0/10) and reserved 0.0.0.0/8
                String ip = addr.getHostAddress();
                if (isCarrierGradeNat(ip) || ip.startsWith("0.")) {
                    throw new IllegalArgumentException(
                            "URL resolves to a restricted address: " + ip);
                }
            }
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Cannot resolve hostname: " + host);
        }
    }

    private boolean isExplicitLoopbackHost(String host) {
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("[") && normalized.endsWith("]")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        return "localhost".equals(normalized)
                || "127.0.0.1".equals(normalized)
                || "::1".equals(normalized);
    }

    private String safeApiKey(String apiKey) {
        return apiKey == null || apiKey.isBlank() ? "sk-local-placeholder" : apiKey;
    }

    private boolean isOpenAiChatResponse(String response) {
        if (response == null || response.isBlank()) {
            return false;
        }
        try {
            JsonNode message =
                    objectMapper.readTree(response).path("choices").path(0).path("message");
            JsonNode content = message.path("content");
            return content.isTextual();
        } catch (Exception ex) {
            return false;
        }
    }

    private String classifyProbeFailure(Throwable error) {
        for (Throwable current = error;
                current != null && current.getCause() != current;
                current = current.getCause()) {
            if (current instanceof ProbeException probeException) {
                return probeException.getMessage();
            }
            if (current instanceof WebClientResponseException responseException) {
                return "Model endpoint returned HTTP " + responseException.getStatusCode().value();
            }
            if (current instanceof WebClientRequestException) {
                return "Cannot connect to model endpoint";
            }
            if (current instanceof TimeoutException) {
                return "Model endpoint request timed out";
            }
        }
        return "Model endpoint request failed";
    }

    /**
     * Check if IP is in the carrier-grade NAT range 100.64.0.0/10 (100.64.0.0 – 100.127.255.255).
     */
    private boolean isCarrierGradeNat(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length < 2) return false;
        try {
            int first = Integer.parseInt(parts[0]);
            int second = Integer.parseInt(parts[1]);
            return first == 100 && second >= 64 && second <= 127;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private Duration probeTimeout() {
        return Duration.ofMillis(
                Math.max(1_000, appProperties.getStartupValidation().getModelProbeTimeoutMs()));
    }

    private String normalizeBaseUrl(String baseUrl) {
        if (baseUrl == null) {
            return "";
        }
        String trimmed = baseUrl.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }

    private static final class ProbeException extends RuntimeException {
        private ProbeException(String message) {
            super(message);
        }
    }

    public record ProbeResult(boolean ok, String message) {}
}
