package com.agent.sentinel;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class SentinelWebhookClient {

    private final RestTemplate restTemplate;
    private final String webhookUrl;
    private final String projectName;

    public SentinelWebhookClient(String webhookUrl, String projectName) {
        this.restTemplate = new RestTemplate();
        this.webhookUrl = webhookUrl != null ? webhookUrl : "http://localhost:8080/api/v1/sentinel/report";
        this.projectName = projectName != null ? projectName : "default-project";
    }

    public void reportException(String stackTrace) {
        CompletableFuture.runAsync(() -> {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                Map<String, String> payload = new HashMap<>();
                payload.put("projectName", projectName);
                payload.put("stackTrace", stackTrace);

                HttpEntity<Map<String, String>> request = new HttpEntity<>(payload, headers);
                restTemplate.postForEntity(webhookUrl, request, String.class);
            } catch (Exception e) {
                // Ignore failure to report, avoid infinite loops
                System.err.println("Failed to send sentinel report: " + e.getMessage());
            }
        });
    }
}
