package com.agent.mvp.modelsource.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.config.AppProperties;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ModelSourceProbeServiceTest {

    private final ModelSourceProbeService probeService =
            new ModelSourceProbeService(new AppProperties());
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void localCompatiblePolicyAllowsOnlyLoopbackAddresses() {
        assertDoesNotThrow(
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://localhost:1234/v1")));
        assertDoesNotThrow(
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://127.0.0.1:1234/v1")));
        assertDoesNotThrow(
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://[::1]:1234/v1")));

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://0.0.0.0:1234/v1")));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://192.168.1.5:1234/v1")));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://8.8.8.8:1234/v1")));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        probeService.validateForUse(
                                source("local_compatible", "http://127.0.0.2:1234/v1")));
        assertThrows(
                IllegalArgumentException.class,
                () -> probeService.validateForUse(source("openai", "http://127.0.0.1:1234/v1")));
    }

    @Test
    void localCompatibleProbePostsConfiguredModelToChatCompletions() throws Exception {
        AtomicReference<String> requestMethod = new AtomicReference<>();
        AtomicReference<String> requestBody = new AtomicReference<>();
        int port =
                startServer(
                        exchange -> {
                            requestMethod.set(exchange.getRequestMethod());
                            requestBody.set(
                                    new String(
                                            exchange.getRequestBody().readAllBytes(),
                                            StandardCharsets.UTF_8));
                            sendJson(
                                    exchange,
                                    200,
                                    """
{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}
""");
                        });

        ModelSourceProbeService.ProbeResult result =
                probeService.probe(source("local_compatible", "http://127.0.0.1:" + port + "/v1"));

        assertTrue(result.ok());
        assertEquals("POST", requestMethod.get());
        JsonNode payload = new ObjectMapper().readTree(requestBody.get());
        assertEquals("qwen-local", payload.path("model").asText());
        assertEquals(
                "Reply with the single word: ok.",
                payload.path("messages").get(0).path("content").asText());
    }

    @Test
    void localCompatibleProbeRejectsRedirectWithoutFollowingIt() throws Exception {
        int port =
                startServer(
                        exchange -> {
                            exchange.getResponseHeaders()
                                    .set("Location", "http://127.0.0.1:9/elsewhere");
                            exchange.sendResponseHeaders(302, -1);
                            exchange.close();
                        });

        ModelSourceProbeService.ProbeResult result =
                probeService.probe(source("local_compatible", "http://127.0.0.1:" + port + "/v1"));

        assertFalse(result.ok());
        assertTrue(result.message().toLowerCase().contains("redirect"));
    }

    @Test
    void localCompatibleProbeRejectsSuccessfulButNonChatJson() throws Exception {
        int port = startServer(exchange -> sendJson(exchange, 200, "{\"status\":\"ok\"}"));

        ModelSourceProbeService.ProbeResult result =
                probeService.probe(source("local_compatible", "http://127.0.0.1:" + port + "/v1"));

        assertFalse(result.ok());
        assertTrue(result.message().contains("invalid chat response"));
    }

    private int startServer(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", handler);
        server.start();
        return server.getAddress().getPort();
    }

    private void sendJson(HttpExchange exchange, int status, String responseBody)
            throws IOException {
        byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private ModelSource source(String providerType, String baseUrl) {
        return ModelSource.builder()
                .id(UUID.randomUUID())
                .userId(UUID.randomUUID())
                .providerType(providerType)
                .name("local")
                .baseUrl(baseUrl)
                .apiKey("local-key")
                .defaultModel("qwen-local")
                .enabled(true)
                .build();
    }
}
