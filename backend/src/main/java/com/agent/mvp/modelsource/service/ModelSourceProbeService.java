package com.agent.mvp.modelsource.service;

import com.agent.mvp.config.AppProperties;
import com.agent.mvp.modelsource.ModelSourceProviderType;
import com.agent.mvp.modelsource.entity.ModelSource;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

@Service
public class ModelSourceProbeService {

    private final AppProperties appProperties;
    private final WebClient webClient;

    public ModelSourceProbeService(AppProperties appProperties) {
        this.appProperties = appProperties;
        // SSRF mitigation: explicitly disable redirect following
        HttpClient httpClient = HttpClient.create().followRedirect(false);
        this.webClient =
                WebClient.builder()
                        .clientConnector(new ReactorClientHttpConnector(httpClient))
                        .build();
    }

    public ProbeResult probe(ModelSource source) {
        ModelSourceProviderType providerType =
                ModelSourceProviderType.from(source.getProviderType());
        String baseUrl = normalizeBaseUrl(source.getBaseUrl());
        String fullUrl = baseUrl + providerType.probePath();

        try {
            validateUrl(fullUrl);
        } catch (IllegalArgumentException ex) {
            return new ProbeResult(false, ex.getMessage());
        }

        try {
            if (providerType.openAiCompatible()) {
                webClient
                        .get()
                        .uri(fullUrl)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + source.getApiKey())
                        .accept(MediaType.APPLICATION_JSON)
                        .retrieve()
                        .bodyToMono(String.class)
                        .timeout(probeTimeout())
                        .block();
                return new ProbeResult(true, "OpenAI-compatible endpoint reachable");
            }

            webClient
                    .get()
                    .uri(fullUrl)
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

    /**
     * SSRF protection: validate URL protocol and reject hostnames that resolve to private,
     * loopback, link-local, or carrier-grade NAT addresses.
     */
    private void validateUrl(String urlString) {
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

        try {
            InetAddress[] addresses = InetAddress.getAllByName(host);
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
