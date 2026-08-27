package com.agent.mvp.agent.provider;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolSpec;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class OpenAiModelProviderTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    @Test
    void chatShouldSerializeMessagesAndToolsAndExtractToolCalls() throws Exception {
        AtomicReference<JsonNode> capturedBody = new AtomicReference<>();
        AtomicReference<String> capturedAuthorization = new AtomicReference<>();
        AtomicReference<String> capturedPath = new AtomicReference<>();
        String baseUrl =
                startServer(
                        exchange -> {
                            capturedPath.set(exchange.getRequestURI().getPath());
                            capturedAuthorization.set(
                                    exchange.getRequestHeaders().getFirst("Authorization"));
                            capturedBody.set(readJson(exchange));
                            sendJson(
                                    exchange,
                                    200,
                                    """
{"choices":[{"message":{"content":"answer","tool_calls":[
  {"id":"result-1","function":{"name":"lookup","arguments":"{\\\"q\\\":1}"}},
  {"id":"result-2","function":{"name":"fallback"}}
]},"finish_reason":"tool_calls"}]}
""");
                        });
        OpenAiModelProvider provider = provider(baseUrl, "configured-key", 0);
        List<ModelChatMessage> messages =
                List.of(
                        new ModelChatMessage("user", null, " ", " ", null),
                        ModelChatMessage.tool("call-1", "calculator", "42"),
                        ModelChatMessage.assistantWithToolCalls(
                                null,
                                List.of(
                                        new ToolCall("call-2", "lookup", null),
                                        new ToolCall("call-3", "sum", "{\"x\":1}"))));
        ToolSpec tool =
                new ToolSpec(
                        "weather",
                        "Get weather",
                        Map.of("type", "object", "required", List.of("city")));

        ModelChatResponse response =
                provider.chat(
                        new ModelChatRequest(
                                "gpt-test", messages, List.of(tool), "required", null, null));

        JsonNode request = capturedBody.get();
        assertAll(
                () -> assertEquals(ModelProviderType.OPENAI, provider.type()),
                () -> assertEquals("/v1/chat/completions", capturedPath.get()),
                () -> assertEquals("Bearer configured-key", capturedAuthorization.get()),
                () -> assertEquals("gpt-test", request.path("model").asText()),
                () -> assertEquals(0.2, request.path("temperature").asDouble()),
                () -> assertEquals("", request.path("messages").get(0).path("content").asText()),
                () -> assertFalse(request.path("messages").get(0).has("name")),
                () -> assertFalse(request.path("messages").get(0).has("tool_call_id")),
                () ->
                        assertEquals(
                                "calculator",
                                request.path("messages").get(1).path("name").asText()),
                () ->
                        assertEquals(
                                "call-1",
                                request.path("messages").get(1).path("tool_call_id").asText()),
                () ->
                        assertEquals(
                                "{}",
                                request.path("messages")
                                        .get(2)
                                        .path("tool_calls")
                                        .get(0)
                                        .path("function")
                                        .path("arguments")
                                        .asText()),
                () ->
                        assertEquals(
                                "weather",
                                request.path("tools")
                                        .get(0)
                                        .path("function")
                                        .path("name")
                                        .asText()),
                () -> assertEquals("required", request.path("tool_choice").asText()),
                () -> assertEquals("answer", response.content()),
                () -> assertEquals("tool_calls", response.finishReason()),
                () -> assertEquals(2, response.toolCalls().size()),
                () -> assertEquals("{\"q\":1}", response.toolCalls().get(0).argumentsJson()),
                () -> assertEquals("{}", response.toolCalls().get(1).argumentsJson()),
                () -> assertTrue(response.latencyMs() >= 0));
    }

    @Test
    void chatShouldUseCustomEndpointKeyDefaultToolChoiceAndTimeout() throws Exception {
        AtomicReference<JsonNode> capturedBody = new AtomicReference<>();
        AtomicReference<String> capturedAuthorization = new AtomicReference<>();
        String customBaseUrl =
                startServer(
                        exchange -> {
                            capturedAuthorization.set(
                                    exchange.getRequestHeaders().getFirst("Authorization"));
                            capturedBody.set(readJson(exchange));
                            sendJson(
                                    exchange,
                                    200,
                                    "{\"choices\":[{\"message\":{\"content\":null,\"tool_calls\":[]}}]}");
                        });
        OpenAiModelProvider provider = provider("https://unused.invalid/v1", "default-key", 0);

        ModelChatResponse response =
                provider.chat(
                        new ModelChatRequest(
                                "custom-model",
                                List.of(ModelChatMessage.of("user", "hello")),
                                null,
                                null,
                                customBaseUrl,
                                "custom-key",
                                1L));

        assertAll(
                () -> assertEquals("Bearer custom-key", capturedAuthorization.get()),
                () -> assertTrue(capturedBody.get().path("tools").isEmpty()),
                () -> assertEquals("auto", capturedBody.get().path("tool_choice").asText()),
                () -> assertEquals("", response.content()),
                () -> assertTrue(response.toolCalls().isEmpty()),
                () -> assertEquals("", response.finishReason()));
    }

    @Test
    void chatShouldUseLocalPlaceholderButRejectMissingRemoteKey() throws Exception {
        AtomicReference<String> capturedAuthorization = new AtomicReference<>();
        String localBaseUrl =
                startServer(
                        exchange -> {
                            capturedAuthorization.set(
                                    exchange.getRequestHeaders().getFirst("Authorization"));
                            readJson(exchange);
                            sendJson(
                                    exchange,
                                    200,
                                    "{\"choices\":[{\"message\":null,\"finish_reason\":\"stop\"}]}");
                        });
        OpenAiModelProvider localProvider = provider(localBaseUrl, " ", 0);

        ModelChatResponse response =
                localProvider.chat(
                        new ModelChatRequest(
                                "local-model",
                                List.of(ModelChatMessage.of("user", "hello")),
                                List.of(),
                                null,
                                " ",
                                " ",
                                -1L));

        OpenAiModelProvider remoteProvider = provider("https://api.example.invalid/v1", " ", 0);
        BadRequestException error =
                assertThrows(BadRequestException.class, () -> remoteProvider.chat(basicRequest()));
        assertAll(
                () -> assertEquals("Bearer sk-local-mock-placeholder", capturedAuthorization.get()),
                () -> assertEquals("", response.content()),
                () -> assertTrue(response.toolCalls().isEmpty()),
                () -> assertEquals("OPENAI_API_KEY is not configured", error.getMessage()));
    }

    @Test
    void chatShouldRejectEmptyAndInvalidChoices() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        String baseUrl =
                startServer(
                        exchange -> {
                            readJson(exchange);
                            switch (requests.getAndIncrement()) {
                                case 0 -> sendEmpty(exchange, 200);
                                case 1 -> sendJson(exchange, 200, "{}");
                                case 2 -> sendJson(exchange, 200, "{\"choices\":{}}");
                                case 3 -> sendJson(exchange, 200, "{\"choices\":[]}");
                                default ->
                                        sendJson(exchange, 200, "{\"choices\":[{\"message\":{}}]}");
                            }
                        });
        OpenAiModelProvider provider = provider(baseUrl, null, 0);

        BadRequestException empty =
                assertThrows(BadRequestException.class, () -> provider.chat(basicRequest()));
        BadRequestException missing =
                assertThrows(BadRequestException.class, () -> provider.chat(basicRequest()));
        BadRequestException object =
                assertThrows(BadRequestException.class, () -> provider.chat(basicRequest()));
        BadRequestException array =
                assertThrows(BadRequestException.class, () -> provider.chat(basicRequest()));
        ModelChatResponse fallback = provider.chat(basicRequest());

        assertAll(
                () -> assertEquals("OpenAI response is empty", empty.getMessage()),
                () -> assertEquals("OpenAI response choices are empty", missing.getMessage()),
                () -> assertEquals("OpenAI response choices are empty", object.getMessage()),
                () -> assertEquals("OpenAI response choices are empty", array.getMessage()),
                () -> assertEquals("", fallback.content()),
                () -> assertTrue(fallback.toolCalls().isEmpty()),
                () -> assertEquals(5, requests.get()));
    }

    @Test
    void chatShouldNotRetryOrdinary4xxButRetry408429And5xx() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        String baseUrl =
                startServer(
                        exchange -> {
                            readJson(exchange);
                            switch (requests.incrementAndGet()) {
                                case 1 -> sendJson(exchange, 400, "x".repeat(260));
                                case 2 -> sendJson(exchange, 408, "timeout");
                                case 3 -> sendJson(exchange, 429, "rate limited");
                                case 4 -> sendJson(exchange, 503, "unavailable");
                                default ->
                                        sendJson(
                                                exchange,
                                                200,
                                                "{\"choices\":[{\"message\":{\"content\":\"recovered\"}}]}");
                            }
                        });
        OpenAiModelProvider provider = provider(baseUrl, null, 3);

        BadRequestException badRequest =
                assertThrows(BadRequestException.class, () -> provider.chat(basicRequest()));
        assertEquals(1, requests.get());
        ModelChatResponse recovered = provider.chat(basicRequest());

        assertAll(
                () ->
                        assertTrue(
                                badRequest
                                        .getMessage()
                                        .startsWith("OpenAI request failed: HTTP 400")),
                () -> assertTrue(badRequest.getMessage().endsWith("...")),
                () -> assertEquals("recovered", recovered.content()),
                () -> assertEquals(5, requests.get()));
    }

    @Test
    void chatShouldTranslateConnectionFailure() throws Exception {
        String baseUrl = startServer(HttpExchange::close);
        OpenAiModelProvider provider = provider(baseUrl, null, 0);

        BadRequestException error =
                assertThrows(BadRequestException.class, () -> provider.chat(basicRequest()));

        assertEquals("Cannot connect to OpenAI at " + baseUrl, error.getMessage());
    }

    @Test
    void streamShouldEmitContentAndReasoningAndIgnoreInvalidEvents() throws Exception {
        String baseUrl =
                startServer(
                        exchange -> {
                            readJson(exchange);
                            sendSse(
                                    exchange,
                                    ": heartbeat\n\n"
                                        + "data:   \n\n"
                                        + "data: [DONE]\n\n"
                                        + "data: {bad-json\n\n"
                                        + "data: {\"choices\":[]}\n\n"
                                        + "data: {\"choices\":{}}\n\n"
                                        + "data: {\"choices\":[{}]}\n\n"
                                        + "data:"
                                        + " {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n"
                                        + "data:"
                                        + " {\"choices\":[{\"delta\":{\"content\":null,\"reasoning_content\":\""
                                        + " thought\"}}]}\n\n"
                                        + "data:"
                                        + " {\"choices\":[{\"delta\":{\"content\":\"\",\"reasoning_content\":\"!\"}}]}\n\n"
                                        + "data:"
                                        + " {\"choices\":[{\"delta\":{\"content\":\"\",\"reasoning_content\":\"\"}}]}\n\n");
                        });
        OpenAiModelProvider provider = provider(baseUrl, null, 0);
        List<String> chunks = new ArrayList<>();

        ModelChatResponse response = provider.stream(basicRequest(), chunks::add);

        assertAll(
                () -> assertEquals("hello thought!", response.content()),
                () -> assertEquals(List.of("hello", " thought", "!"), chunks),
                () -> assertTrue(response.toolCalls().isEmpty()),
                () -> assertEquals("stop", response.finishReason()),
                () -> assertTrue(response.latencyMs() >= 0));
    }

    @Test
    void streamShouldTranslateHttpError() throws Exception {
        String baseUrl =
                startServer(
                        exchange -> {
                            readJson(exchange);
                            sendJson(exchange, 401, "denied");
                        });
        OpenAiModelProvider provider = provider(baseUrl, null, 0);

        BadRequestException error =
                assertThrows(
                        BadRequestException.class,
                        () -> provider.stream(basicRequest(), ignored -> {}));

        assertEquals("OpenAI request failed: HTTP 401 - denied", error.getMessage());
    }

    @Test
    void streamShouldTranslateConnectionFailure() throws Exception {
        String baseUrl = startServer(HttpExchange::close);
        OpenAiModelProvider provider = provider(baseUrl, null, 0);

        BadRequestException error =
                assertThrows(
                        BadRequestException.class,
                        () -> provider.stream(basicRequest(), ignored -> {}));

        assertEquals("Cannot connect to OpenAI at " + baseUrl, error.getMessage());
    }

    private OpenAiModelProvider provider(String baseUrl, String apiKey, int retries) {
        AppProperties properties = new AppProperties();
        properties.getOpenai().setBaseUrl(baseUrl);
        properties.getOpenai().setApiKey(apiKey);
        properties.getModelRuntime().setConnectTimeoutMs(500);
        properties.getModelRuntime().setReadTimeoutMs(2_000);
        properties.getModelRuntime().setTotalTimeoutMs(2_000);
        properties.getModelRuntime().setIdempotentRetries(retries);
        return new OpenAiModelProvider(properties, objectMapper);
    }

    private ModelChatRequest basicRequest() {
        return new ModelChatRequest(
                "gpt-test",
                List.of(ModelChatMessage.of("user", "hello")),
                List.of(),
                null,
                null,
                null);
    }

    private String startServer(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", handler);
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
    }

    private JsonNode readJson(HttpExchange exchange) throws IOException {
        return objectMapper.readTree(exchange.getRequestBody());
    }

    private void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private void sendEmpty(HttpExchange exchange, int status) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, -1);
        exchange.close();
    }

    private void sendSse(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.sendResponseHeaders(200, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
