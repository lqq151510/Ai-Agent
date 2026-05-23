package com.agent.cli.client;

import com.agent.cli.model.AuthState;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

public class ApiClient {

    public interface StreamEventHandler {
        void onEvent(String event, String data);
    }

    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Duration requestTimeout;

    public ApiClient(String baseUrl, ObjectMapper objectMapper) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.requestTimeout = resolveRequestTimeout();
    }

    public Map<String, Object> post(String path, Object payload, String accessToken) {
        try {
            HttpResponse<String> response = sendPostString(path, payload, accessToken);
            ensureOk(response);
            return objectMapper.readValue(response.body(), new TypeReference<Map<String, Object>>() {});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    public List<Map<String, Object>> getList(String path, String accessToken) {
        try {
            HttpResponse<String> response = sendGet(path, accessToken);
            ensureOk(response);
            return objectMapper.readValue(response.body(), new TypeReference<List<Map<String, Object>>>() {});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> postAuthenticated(String path,
                                                 Object payload,
                                                 AuthState state,
                                                 CliStateStore stateStore) {
        try {
            HttpResponse<String> response = sendPostString(path, payload, state.getAccessToken());
            if (response.statusCode() == 401 && refreshTokens(state, stateStore)) {
                response = sendPostString(path, payload, state.getAccessToken());
            }
            ensureOk(response);
            return objectMapper.readValue(response.body(), new TypeReference<Map<String, Object>>() {});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    public List<Map<String, Object>> getListAuthenticated(String path,
                                                          AuthState state,
                                                          CliStateStore stateStore) {
        try {
            HttpResponse<String> response = sendGet(path, state.getAccessToken());
            if (response.statusCode() == 401 && refreshTokens(state, stateStore)) {
                response = sendGet(path, state.getAccessToken());
            }
            ensureOk(response);
            return objectMapper.readValue(response.body(), new TypeReference<List<Map<String, Object>>>() {});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getAuthenticated(String path,
                                                AuthState state,
                                                CliStateStore stateStore) {
        try {
            HttpResponse<String> response = sendGet(path, state.getAccessToken());
            if (response.statusCode() == 401 && refreshTokens(state, stateStore)) {
                response = sendGet(path, state.getAccessToken());
            }
            ensureOk(response);
            return objectMapper.readValue(response.body(), new TypeReference<Map<String, Object>>() {});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    public String getStringAuthenticated(String path,
                                         AuthState state,
                                         CliStateStore stateStore) {
        try {
            HttpResponse<String> response = sendGet(path, state.getAccessToken());
            if (response.statusCode() == 401 && refreshTokens(state, stateStore)) {
                response = sendGet(path, state.getAccessToken());
            }
            ensureOk(response);
            return response.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    public void streamAuthenticated(String path,
                                    Object payload,
                                    AuthState state,
                                    CliStateStore stateStore,
                                    StreamEventHandler handler) {
        try {
            HttpResponse<Stream<String>> response = sendPostStream(path, payload, state.getAccessToken());
            if (response.statusCode() == 401 && refreshTokens(state, stateStore)) {
                response = sendPostStream(path, payload, state.getAccessToken());
            }

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String body = response.body().limit(64).reduce("", (a, b) -> a + "\n" + b);
                throw new RuntimeException("API error " + response.statusCode() + ": " + errorMessage(body, response.statusCode()));
            }

            try (Stream<String> lines = response.body()) {
                parseSse(lines, handler);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP request interrupted", e);
        } catch (IOException e) {
            throw new RuntimeException("HTTP request failed: " + e.getMessage(), e);
        }
    }

    private HttpResponse<String> sendPostString(String path, Object payload, String accessToken)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)));

        addAuthorization(builder, accessToken);
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<Stream<String>> sendPostStream(String path, Object payload, String accessToken)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)));

        addAuthorization(builder, accessToken);
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofLines());
    }

    private HttpResponse<String> sendGet(String path, String accessToken)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(requestTimeout)
                .GET();

        addAuthorization(builder, accessToken);
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private void addAuthorization(HttpRequest.Builder builder, String accessToken) {
        if (accessToken != null && !accessToken.isBlank()) {
            builder.header("Authorization", "Bearer " + accessToken);
        }
    }

    private boolean refreshTokens(AuthState state, CliStateStore stateStore) throws IOException, InterruptedException {
        if (state.getRefreshToken() == null || state.getRefreshToken().isBlank()) {
            return false;
        }

        HttpResponse<String> response = sendPostString(
                "/api/v1/auth/refresh",
                Map.of("refreshToken", state.getRefreshToken()),
                null
        );
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            return false;
        }

        Map<String, Object> tokens = objectMapper.readValue(response.body(), new TypeReference<>() {});
        Object accessToken = tokens.get("accessToken");
        Object refreshToken = tokens.get("refreshToken");
        if (accessToken == null || refreshToken == null) {
            return false;
        }

        state.setAccessToken(String.valueOf(accessToken));
        state.setRefreshToken(String.valueOf(refreshToken));
        stateStore.write(state);
        return true;
    }

    private void ensureOk(HttpResponse<String> response) {
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return;
        }
        throw new RuntimeException("API error " + response.statusCode() + ": " + errorMessage(response.body(), response.statusCode()));
    }

    private String errorMessage(String body, int statusCode) {
        if (body == null || body.isBlank()) {
            return defaultStatusMessage(statusCode);
        }

        try {
            Map<String, Object> payload = objectMapper.readValue(body, new TypeReference<>() {});
            String message = asString(payload.get("message"));
            String code = asString(payload.get("code"));
            String requestId = asString(payload.get("requestId"));

            if (message == null || message.isBlank()) {
                message = code != null && !code.isBlank() ? code : defaultStatusMessage(statusCode);
            }

            String hint = errorHint(code, statusCode);
            StringBuilder out = new StringBuilder(message);
            if (hint != null && !hint.isBlank()) {
                out.append(" ").append(hint);
            }
            if (requestId != null && !requestId.isBlank()) {
                out.append(" [requestId=").append(requestId).append("]");
            }
            return out.toString();
        } catch (IOException ignored) {
            return body;
        }
    }

    private String errorHint(String code, int statusCode) {
        String normalizedCode = code == null ? "" : code.trim().toUpperCase();
        if (statusCode == 401 || "UNAUTHORIZED".equals(normalizedCode)) {
            return "Please login again.";
        }
        if (statusCode == 429 || "TOO_MANY_REQUESTS".equals(normalizedCode)) {
            return "Rate limit reached. Retry after a short delay.";
        }
        if (statusCode == 403 || "FORBIDDEN".equals(normalizedCode)) {
            return "Current account is not allowed to perform this action.";
        }
        return null;
    }

    private String defaultStatusMessage(int statusCode) {
        return switch (statusCode) {
            case 400 -> "Bad request";
            case 401 -> "Authentication required";
            case 403 -> "Forbidden";
            case 404 -> "Resource not found";
            case 429 -> "Too many requests";
            default -> "Request failed";
        };
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        return String.valueOf(value);
    }

    private void parseSse(Stream<String> lines, StreamEventHandler handler) {
        String event = "message";
        List<String> dataLines = new ArrayList<>();

        for (String rawLine : (Iterable<String>) lines::iterator) {
            String line = rawLine == null ? "" : rawLine;

            if (line.isBlank()) {
                dispatchEvent(handler, event, dataLines);
                event = "message";
                dataLines.clear();
                continue;
            }

            if (line.startsWith(":")) {
                continue;
            }

            if (line.startsWith("event:")) {
                event = line.substring("event:".length()).trim();
                continue;
            }

            if (line.startsWith("data:")) {
                dataLines.add(line.substring("data:".length()).trim());
            }
        }

        dispatchEvent(handler, event, dataLines);
    }

    private void dispatchEvent(StreamEventHandler handler, String event, List<String> dataLines) {
        if (dataLines.isEmpty()) {
            return;
        }
        handler.onEvent(event, String.join("\n", dataLines));
    }

    private Duration resolveRequestTimeout() {
        String raw = System.getenv("AGENT_API_TIMEOUT_SECONDS");
        if (raw == null || raw.isBlank()) {
            return Duration.ofSeconds(300);
        }

        try {
            long seconds = Long.parseLong(raw.trim());
            if (seconds < 10) {
                seconds = 10;
            }
            return Duration.ofSeconds(seconds);
        } catch (NumberFormatException ignored) {
            return Duration.ofSeconds(300);
        }
    }
}
