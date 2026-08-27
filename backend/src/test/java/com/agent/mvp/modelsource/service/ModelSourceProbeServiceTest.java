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
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.core.publisher.Mono;

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
    void validationRequiresModelSource() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class, () -> probeService.validateForUse(null));

        assertEquals("Model source is required", error.getMessage());
    }

    @ParameterizedTest
    @MethodSource("invalidModelSourceUrls")
    void validationRejectsInvalidAndRestrictedUrls(
            String providerType, String baseUrl, String expectedMessage) {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> probeService.validateForUse(source(providerType, baseUrl)));

        assertTrue(error.getMessage().contains(expectedMessage), error::getMessage);
    }

    @ParameterizedTest
    @MethodSource("allowedPublicUrls")
    void validationAllowsPublicCloudAddresses(String baseUrl) {
        assertDoesNotThrow(() -> probeService.validateForUse(source("openai", baseUrl)));
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

    @ParameterizedTest
    @MethodSource("missingLocalModels")
    void localCompatibleProbeRequiresDefaultModel(String defaultModel) {
        ModelSource source = source("local_compatible", "http://127.0.0.1:1234/v1");
        source.setDefaultModel(defaultModel);

        ModelSourceProbeService.ProbeResult result = probeService.probe(source);

        assertFalse(result.ok());
        assertEquals("Local model source default model is required", result.message());
    }

    @Test
    void localCompatibleProbeRejectsNonSuccessfulStatus() {
        ModelSourceProbeService service = serviceResponding(HttpStatus.SERVICE_UNAVAILABLE, "{}");

        ModelSourceProbeService.ProbeResult result =
                service.probe(source("local_compatible", "http://127.0.0.1:1234/v1"));

        assertFalse(result.ok());
        assertEquals("Model endpoint returned HTTP 503", result.message());
    }

    @ParameterizedTest
    @MethodSource("invalidChatResponses")
    void localCompatibleProbeRejectsEmptyAndMalformedChatResponses(String responseBody) {
        ModelSourceProbeService service = serviceResponding(HttpStatus.OK, responseBody);

        ModelSourceProbeService.ProbeResult result =
                service.probe(source("local_compatible", "http://127.0.0.1:1234/v1"));

        assertFalse(result.ok());
        assertEquals("Local model endpoint returned an invalid chat response", result.message());
    }

    @Test
    void localCompatibleProbeUsesPlaceholderForMissingApiKey() {
        List<String> authorizationHeaders = new ArrayList<>();
        ModelSourceProbeService service =
                serviceWithExchange(
                        request -> {
                            authorizationHeaders.add(request.headers().getFirst("Authorization"));
                            return Mono.just(
                                    jsonResponse(
                                            HttpStatus.OK,
                                            "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));
                        });
        ModelSource source = source("local_compatible", "http://127.0.0.1:1234/v1");

        source.setApiKey(null);
        assertTrue(service.probe(source).ok());
        source.setApiKey("   ");
        assertTrue(service.probe(source).ok());

        assertEquals(
                List.of("Bearer sk-local-placeholder", "Bearer sk-local-placeholder"),
                authorizationHeaders);
    }

    @ParameterizedTest
    @MethodSource("cloudProbeResponses")
    void cloudProbeClassifiesSuccessRedirectAndHttpFailure(
            String providerType, HttpStatus status, boolean expectedOk, String expectedMessage) {
        ModelSourceProbeService service = serviceResponding(status, "{}");

        ModelSourceProbeService.ProbeResult result =
                service.probe(source(providerType, "https://8.8.8.8/v1"));

        assertEquals(expectedOk, result.ok());
        assertEquals(expectedMessage, result.message());
    }

    @Test
    void probeClassifiesConnectionFailure() {
        ModelSourceProbeService service =
                serviceWithExchange(
                        request ->
                                Mono.error(
                                        new WebClientRequestException(
                                                new ConnectException("Connection refused"),
                                                request.method(),
                                                request.url(),
                                                request.headers())));

        ModelSourceProbeService.ProbeResult result =
                service.probe(source("local_compatible", "http://127.0.0.1:1234/v1"));

        assertFalse(result.ok());
        assertEquals("Cannot connect to model endpoint", result.message());
    }

    @Test
    void probeClassifiesTimeoutAndUnexpectedFailure() {
        ModelSourceProbeService timeoutService =
                serviceWithExchange(
                        request -> Mono.error(new java.util.concurrent.TimeoutException("slow")));
        ModelSourceProbeService failingService =
                serviceWithExchange(request -> Mono.error(new IllegalStateException("unexpected")));
        ModelSource source = source("local_compatible", "http://127.0.0.1:1234/v1");

        assertEquals("Model endpoint request timed out", timeoutService.probe(source).message());
        assertEquals("Model endpoint request failed", failingService.probe(source).message());
    }

    private static Stream<Arguments> invalidModelSourceUrls() {
        return Stream.of(
                Arguments.of("openai", null, "Only http/https protocols are allowed"),
                Arguments.of("openai", "ftp://8.8.8.8/v1", "Only http/https protocols are allowed"),
                Arguments.of("openai", "http://[", "Invalid URL"),
                Arguments.of("openai", "http:///v1", "URL must have a hostname"),
                Arguments.of(
                        "openai",
                        "https://user:password@8.8.8.8/v1",
                        "URL cannot include credentials, query, or fragment"),
                Arguments.of(
                        "openai",
                        "https://8.8.8.8/v1?key=value",
                        "URL cannot include credentials, query, or fragment"),
                Arguments.of(
                        "openai",
                        "https://8.8.8.8/v1#fragment",
                        "URL cannot include credentials, query, or fragment"),
                Arguments.of(
                        "openai",
                        "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.example/v1",
                        "Cannot resolve hostname"),
                Arguments.of("openai", "https://10.0.0.1/v1", "restricted address"),
                Arguments.of("openai", "https://169.254.1.1/v1", "restricted address"),
                Arguments.of("openai", "https://0.0.0.0/v1", "restricted address"),
                Arguments.of("openai", "https://224.0.0.1/v1", "restricted address"),
                Arguments.of("openai", "https://100.64.0.1/v1", "restricted address"),
                Arguments.of("openai", "https://0.1.2.3/v1", "restricted address"));
    }

    private static Stream<Arguments> allowedPublicUrls() {
        return Stream.of(
                Arguments.of("http://8.8.8.8/v1"),
                Arguments.of("https://100.63.0.1/v1"),
                Arguments.of("https://100.128.0.1/v1"),
                Arguments.of("https://[2001:4860:4860::8888]/v1"));
    }

    private static Stream<Arguments> missingLocalModels() {
        return Stream.of(Arguments.of((String) null), Arguments.of("   "));
    }

    private static Stream<Arguments> invalidChatResponses() {
        return Stream.of(
                Arguments.of((String) null),
                Arguments.of("   "),
                Arguments.of("not-json"),
                Arguments.of("{\"choices\":[{\"message\":{\"content\":1}}]}"));
    }

    private static Stream<Arguments> cloudProbeResponses() {
        return Stream.of(
                Arguments.of("openai", HttpStatus.OK, true, "OpenAI-compatible endpoint reachable"),
                Arguments.of(
                        "openai", HttpStatus.FOUND, false, "Model endpoint returned a redirect"),
                Arguments.of(
                        "openai",
                        HttpStatus.BAD_GATEWAY,
                        false,
                        "Model endpoint returned HTTP 502"),
                Arguments.of("anthropic", HttpStatus.OK, true, "Anthropic endpoint reachable"),
                Arguments.of(
                        "anthropic", HttpStatus.FOUND, false, "Model endpoint returned a redirect"),
                Arguments.of(
                        "anthropic",
                        HttpStatus.UNAUTHORIZED,
                        false,
                        "Model endpoint returned HTTP 401"));
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

    private ModelSourceProbeService serviceResponding(HttpStatus status, String responseBody) {
        return serviceWithExchange(request -> Mono.just(jsonResponse(status, responseBody)));
    }

    private ClientResponse jsonResponse(HttpStatus status, String responseBody) {
        ClientResponse.Builder response =
                ClientResponse.create(status).header("Content-Type", "application/json");
        if (responseBody != null) {
            response.body(responseBody);
        }
        return response.build();
    }

    private ModelSourceProbeService serviceWithExchange(ExchangeFunction exchangeFunction) {
        ModelSourceProbeService service = new ModelSourceProbeService(new AppProperties());
        ReflectionTestUtils.setField(
                service,
                "webClient",
                WebClient.builder().exchangeFunction(exchangeFunction).build());
        return service;
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
