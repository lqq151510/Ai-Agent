package com.agent.mvp.agent;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.session.entity.Message;
import com.agent.mvp.session.repo.MessageRepository;
import com.agent.mvp.tooling.repo.ToolAuditRepository;
import com.github.tomakehurst.wiremock.WireMockServer;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers(disabledWithoutDocker = true)
class AgentFlowIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("ai_agent_test")
                    .withUsername("test_user")
                    .withPassword("test_pass");

    @Container
    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);

    static final WireMockServer OPENAI_MOCK = new WireMockServer(wireMockConfig().dynamicPort());

    static {
        OPENAI_MOCK.start();
        configureOpenAiStubs();
    }

    @LocalServerPort int port;

    @Autowired TestRestTemplate restTemplate;

    @Autowired MessageRepository messageRepository;

    @Autowired ToolAuditRepository toolAuditRepository;

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);

        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("spring.data.redis.username", () -> "");
        registry.add("spring.data.redis.password", () -> "");

        registry.add("security.jwt.secret", () -> "01234567890123456789012345678901");
        registry.add("app.default-provider", () -> "OPENAI");
        registry.add("app.default-openai-model", () -> "mock-model");
        registry.add("app.openai.base-url", () -> "http://localhost:" + OPENAI_MOCK.port());
        registry.add("app.openai.api-key", () -> "sk-test-key");
    }

    @AfterAll
    static void tearDown() {
        if (OPENAI_MOCK.isRunning()) {
            OPENAI_MOCK.stop();
        }
    }

    @Test
    void registerLoginSessionChatFlow() {
        String email = "it_" + UUID.randomUUID() + "@example.com";
        String password = "Passw0rd123";

        ResponseEntity<Map<String, Object>> register =
                postJson(
                        "/api/v1/auth/register",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        assertStatus(register, 200);
        assertNotNull(register.getBody());

        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        assertStatus(login, 200);
        assertNotNull(login.getBody());
        String accessToken = String.valueOf(login.getBody().get("accessToken"));
        assertFalse(accessToken.isBlank());

        ResponseEntity<Map<String, Object>> createSession =
                postJson(
                        "/api/v1/sessions",
                        Map.of(
                                "title",
                                "IT Session",
                                "provider",
                                "OPENAI",
                                "model",
                                "mock-model",
                                "taskType",
                                "requirements",
                                "taskGoal",
                                "拆解仓库里的新功能需求",
                                "taskStatus",
                                "planned",
                                "contextTokenLimit",
                                1800),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(createSession, 200);
        assertNotNull(createSession.getBody());
        assertEquals("requirements", String.valueOf(createSession.getBody().get("taskType")));
        assertEquals("planned", String.valueOf(createSession.getBody().get("taskStatus")));
        assertEquals(1800, ((Number) createSession.getBody().get("contextTokenLimit")).intValue());
        String sessionId = String.valueOf(createSession.getBody().get("id"));

        ResponseEntity<Map<String, Object>> chat =
                postJson(
                        "/api/v1/agent/chat",
                        Map.of("sessionId", sessionId, "message", "hello integration"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(chat, 200);
        assertNotNull(chat.getBody());
        assertEquals("mock-openai-reply", String.valueOf(chat.getBody().get("reply")));

        Map<String, Object> execution = (Map<String, Object>) chat.getBody().get("execution");
        assertNotNull(execution);
        assertEquals(10, ((Number) execution.get("totalTokenUsage")).intValue());

        ResponseEntity<List<Map<String, Object>>> messagesResponse =
                getJson(
                        "/api/v1/sessions/" + sessionId + "/messages",
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(messagesResponse, 200);
        assertNotNull(messagesResponse.getBody());
        assertTrue(messagesResponse.getBody().size() >= 2);
        assertTrue(
                messagesResponse.getBody().stream()
                        .anyMatch(m -> "assistant".equals(m.get("role"))));
        assertTrue(
                messagesResponse.getBody().stream()
                        .anyMatch(m -> "OPENAI".equals(m.get("provider"))));

        List<Message> persisted =
                messageRepository.selectList(
                        new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<
                                        Message>()
                                .eq(Message::getSessionId, UUID.fromString(sessionId))
                                .orderByAsc(Message::getCreatedAt));
        assertTrue(persisted.size() >= 2);
        assertTrue(
                toolAuditRepository.selectList(null).stream()
                        .anyMatch(
                                audit -> UUID.fromString(sessionId).equals(audit.getSessionId())));
    }

    @Test
    void streamChatShouldEmitSseEvents() {
        String email = "it_stream_" + UUID.randomUUID() + "@example.com";
        String password = "Passw0rd123";

        postJson(
                "/api/v1/auth/register",
                Map.of("email", email, "password", password),
                null,
                new ParameterizedTypeReference<>() {});

        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        String accessToken = String.valueOf(login.getBody().get("accessToken"));

        ResponseEntity<Map<String, Object>> createSession =
                postJson(
                        "/api/v1/sessions",
                        Map.of(
                                "title",
                                "IT Stream Session",
                                "provider",
                                "OPENAI",
                                "model",
                                "mock-model"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        String sessionId = String.valueOf(createSession.getBody().get("id"));

        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));
        HttpEntity<Map<String, Object>> request =
                new HttpEntity<>(
                        Map.of("sessionId", sessionId, "message", "stream please"), headers);

        ResponseEntity<String> streamResponse =
                restTemplate.exchange(
                        url("/api/v1/agent/chat/stream"), HttpMethod.POST, request, String.class);

        assertStatus(streamResponse, 200);
        String body = streamResponse.getBody() == null ? "" : streamResponse.getBody();
        assertTrue(body.contains("event:meta"));
        assertTrue(body.contains("event:chunk\ndata: {\"text\":\"mock-\"}"));
        assertTrue(body.contains("event:chunk\ndata: {\"text\":\"openai-\"}"));
        assertTrue(body.contains("event:chunk\ndata: {\"text\":\"stream\"}"));
        assertTrue(body.contains("event:done"));
        assertFalse(body.contains("event:error"));
        assertTrue(body.contains("\"totalTokenUsage\":15"));
    }

    @Test
    void shouldUpdateSessionContextTokenLimit() {
        String email = "it_ctx_" + UUID.randomUUID() + "@example.com";
        String password = "Passw0rd123";

        postJson(
                "/api/v1/auth/register",
                Map.of("email", email, "password", password),
                null,
                new ParameterizedTypeReference<>() {});

        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        String accessToken = String.valueOf(login.getBody().get("accessToken"));

        ResponseEntity<Map<String, Object>> createSession =
                postJson(
                        "/api/v1/sessions",
                        Map.of("title", "CTX Session", "provider", "OPENAI", "model", "mock-model"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        String sessionId = String.valueOf(createSession.getBody().get("id"));

        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request =
                new HttpEntity<>(Map.of("contextTokenLimit", 2200), headers);

        ResponseEntity<Map<String, Object>> updated =
                restTemplate.exchange(
                        url("/api/v1/sessions/" + sessionId + "/context-token-limit"),
                        HttpMethod.PATCH,
                        request,
                        new ParameterizedTypeReference<>() {});

        assertStatus(updated, 200);
        assertNotNull(updated.getBody());
        assertEquals(2200, ((Number) updated.getBody().get("contextTokenLimit")).intValue());
    }

    @Test
    void shouldUpdateSessionWorkflow() {
        String email = "it_workflow_" + UUID.randomUUID() + "@example.com";
        String password = "Passw0rd123";

        postJson(
                "/api/v1/auth/register",
                Map.of("email", email, "password", password),
                null,
                new ParameterizedTypeReference<>() {});

        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        String accessToken = String.valueOf(login.getBody().get("accessToken"));

        ResponseEntity<Map<String, Object>> createSession =
                postJson(
                        "/api/v1/sessions",
                        Map.of(
                                "title",
                                "Workflow Session",
                                "provider",
                                "OPENAI",
                                "model",
                                "mock-model"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        String sessionId = String.valueOf(createSession.getBody().get("id"));

        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request =
                new HttpEntity<>(
                        Map.of(
                                "taskType", "logs",
                                "taskGoal", "定位 Spring Boot 启动报错",
                                "taskStatus", "in_progress"),
                        headers);

        ResponseEntity<Map<String, Object>> updated =
                restTemplate.exchange(
                        url("/api/v1/sessions/" + sessionId + "/workflow"),
                        HttpMethod.PATCH,
                        request,
                        new ParameterizedTypeReference<>() {});

        assertStatus(updated, 200);
        assertNotNull(updated.getBody());
        assertEquals("logs", String.valueOf(updated.getBody().get("taskType")));
        assertEquals("定位 Spring Boot 启动报错", String.valueOf(updated.getBody().get("taskGoal")));
        assertEquals("in_progress", String.valueOf(updated.getBody().get("taskStatus")));
    }

    @Test
    void chatShouldReturnClientErrorWhenChoicesIsNotArray() {
        OPENAI_MOCK.stubFor(
                post(urlEqualTo("/chat/completions"))
                        .atPriority(1)
                        .withRequestBody(matchingJsonPath("$.stream", equalTo("false")))
                        .willReturn(
                                aResponse()
                                        .withStatus(200)
                                        .withHeader("Content-Type", "application/json")
                                        .withBody(
                                                """
                                                {"choices":"invalid-shape"}
                                                """)));

        String email = "it_invalid_choices_" + UUID.randomUUID() + "@example.com";
        String password = "Passw0rd123";

        postJson(
                "/api/v1/auth/register",
                Map.of("email", email, "password", password),
                null,
                new ParameterizedTypeReference<>() {});

        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        String accessToken = String.valueOf(login.getBody().get("accessToken"));

        ResponseEntity<Map<String, Object>> createSession =
                postJson(
                        "/api/v1/sessions",
                        Map.of(
                                "title",
                                "Invalid Choices Session",
                                "provider",
                                "OPENAI",
                                "model",
                                "mock-model"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        String sessionId = String.valueOf(createSession.getBody().get("id"));

        ResponseEntity<Map<String, Object>> chat =
                postJson(
                        "/api/v1/agent/chat",
                        Map.of("sessionId", sessionId, "message", "hello"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});

        assertStatus(chat, 400);
        assertNotNull(chat.getBody());
        assertTrue(String.valueOf(chat.getBody().get("message")).contains("choices are empty"));

        OPENAI_MOCK.resetRequests();
        OPENAI_MOCK.resetToDefaultMappings();
        configureOpenAiStubs();
    }

    private static void configureOpenAiStubs() {
        OPENAI_MOCK.stubFor(
                get(urlEqualTo("/models"))
                        .willReturn(
                                aResponse()
                                        .withStatus(200)
                                        .withHeader("Content-Type", "application/json")
                                        .withBody(
                                                """
{"object":"list","data":[{"id":"mock-model","object":"model"}]}
""")));

        OPENAI_MOCK.stubFor(
                post(urlEqualTo("/chat/completions"))
                        .withRequestBody(matchingJsonPath("$.stream", equalTo("false")))
                        .willReturn(
                                aResponse()
                                        .withStatus(200)
                                        .withHeader("Content-Type", "application/json")
                                        .withBody(
                                                """
{"choices":[{"message":{"role":"assistant","content":"mock-openai-reply"}}],"usage":{"total_tokens":10}}
""")));

        OPENAI_MOCK.stubFor(
                post(urlEqualTo("/chat/completions"))
                        .withRequestBody(matchingJsonPath("$.stream", equalTo("true")))
                        .willReturn(
                                aResponse()
                                        .withStatus(200)
                                        .withHeader("Content-Type", "text/event-stream")
                                        .withFixedDelay((int) Duration.ofMillis(80).toMillis())
                                        .withBody(
                                                """
data: {"choices":[{"delta":{"role":"assistant","content":"mock-"}}]}

data: {"choices":[{"delta":{"content":"openai-"}}]}

data: {"choices":[{"delta":{"content":"stream"}}]}

data: {"choices":[],"usage":{"total_tokens":15}}

data: [DONE]
""")));
    }

    private <T> ResponseEntity<T> postJson(
            String path, Object payload, String accessToken, ParameterizedTypeReference<T> type) {
        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Object> request = new HttpEntity<>(payload, headers);
        return restTemplate.exchange(url(path), HttpMethod.POST, request, type);
    }

    private <T> ResponseEntity<T> getJson(
            String path, String accessToken, ParameterizedTypeReference<T> type) {
        HttpEntity<Void> request = new HttpEntity<>(authHeaders(accessToken));
        return restTemplate.exchange(url(path), HttpMethod.GET, request, type);
    }

    private HttpHeaders authHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        if (accessToken != null && !accessToken.isBlank()) {
            headers.setBearerAuth(accessToken);
        }
        return headers;
    }

    private void assertStatus(ResponseEntity<?> response, int expected) {
        HttpStatusCode status = response.getStatusCode();
        assertEquals(expected, status.value());
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
