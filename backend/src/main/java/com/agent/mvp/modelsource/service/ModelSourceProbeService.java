package com.agent.mvp.modelsource.service;

import com.agent.mvp.config.AppProperties;
import com.agent.mvp.modelsource.ModelSourceProviderType;
import com.agent.mvp.modelsource.entity.ModelSource;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class ModelSourceProbeService {

    private final AppProperties appProperties;

    public ModelSourceProbeService(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    public ProbeResult probe(ModelSource source) {
        ModelSourceProviderType providerType = ModelSourceProviderType.from(source.getProviderType());
        String baseUrl = normalizeBaseUrl(source.getBaseUrl());
        try {
            if (providerType.openAiCompatible()) {
                WebClient.create()
                        .get()
                        .uri(baseUrl + providerType.probePath())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + source.getApiKey())
                        .accept(MediaType.APPLICATION_JSON)
                        .retrieve()
                        .bodyToMono(String.class)
                        .timeout(probeTimeout())
                        .block();
                return new ProbeResult(true, "OpenAI-compatible endpoint reachable");
            }

            WebClient.create()
                    .get()
                    .uri(baseUrl + providerType.probePath())
                    .header("x-api-key", source.getApiKey())
                    .header("anthropic-version", "2023-06-01")
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(probeTimeout())
                    .block();
            return new ProbeResult(true, "Anthropic endpoint reachable");
        } catch (Exception ex) {
            return new ProbeResult(false, sanitize(ex.getMessage()));
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
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    private String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return "Unknown probe error";
        }
        return raw.length() > 500 ? raw.substring(0, 500) : raw;
    }

    public record ProbeResult(boolean ok, String message) {}
}
