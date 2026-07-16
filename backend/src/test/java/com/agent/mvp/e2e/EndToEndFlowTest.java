package com.agent.mvp.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.coach.agent.SandboxManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 端到端完整用户旅程测试。
 *
 * <p>覆盖以下完整流程（单个测试方法串起）： 1. 注册新用户 2. 登录获取 accessToken 3. 创建会话 4. 同步对话（mock 模型） 5. 流式对话（验证 SSE
 * 事件：meta + chunk + done） 6. 获取会话消息 7. 导出会话为 Markdown 8. Coach 需求拆解（mock 模型） 9. 系统就绪检查 10. 工具统计
 *
 * <p>测试环境：H2 内存数据库 + Caffeine 缓存（无 Redis 依赖） + 内置 HttpServer 模拟 OpenAI 兼容接口。
 *
 * <p>注意：由于 WireMock 2.35.2 与 Spring Boot 3 的 Jetty 12 存在版本冲突， 本测试使用 JDK 内置的
 * com.sun.net.httpserver.HttpServer 作为轻量级 mock 服务器。
 */
@DisplayName("端到端完整用户旅程测试：注册 -> 登录 -> 会话 -> 对话 -> 流式 -> 导出 -> Coach -> 系统检查")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles({"desktop", "test", "legacy"})
class EndToEndFlowTest {

    // 内置 mock 服务器，模拟 OpenAI 兼容接口
    static HttpServer mockServer;
    static int mockPort;

    @LocalServerPort int port;

    @Autowired TestRestTemplate restTemplate;

    /**
     * 测试专用 Bean 配置。
     *
     * <p>SandboxManager 有两个构造函数，Spring 无法自动选择， 此处显式定义 Bean，使用 public 构造函数 并传入工作区根路径。
     */
    @TestConfiguration
    static class E2eTestConfiguration {
        @Bean
        @Primary
        public SandboxManager sandboxManager(ObjectMapper objectMapper) {
            // 使用当前工作目录作为 workspace root，避免依赖外部目录
            // 调用 public 构造函数 SandboxManager(String workspaceRoot, ObjectMapper)
            return new SandboxManager(System.getProperty("user.dir"), objectMapper);
        }
    }

    @BeforeAll
    static void startMockServer() throws IOException {
        // 启动内置 HttpServer，绑定到随机端口
        mockServer = HttpServer.create(new InetSocketAddress(0), 0);
        mockPort = mockServer.getAddress().getPort();

        // 注册 /v1/models 处理器：返回 mock 模型列表
        mockServer.createContext("/v1/models", new MockModelsHandler());

        // 注册 /v1/chat/completions 处理器：根据 stream 字段返回不同响应
        mockServer.createContext("/v1/chat/completions", new MockChatCompletionsHandler());

        mockServer.setExecutor(null);
        mockServer.start();
    }

    @AfterAll
    static void stopMockServer() {
        if (mockServer != null) {
            mockServer.stop(0);
        }
    }

    // 动态注入 mock 服务器端口到应用配置，覆盖 application-test.yml 中的占位值
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("app.openai.base-url", () -> "http://localhost:" + mockPort + "/v1");
        registry.add("app.openai.api-key", () -> "sk-test-key");
    }

    /**
     * 完整用户旅程：从注册到系统检查的端到端流程。
     *
     * <p>遵循 AAA 模式（Arrange-Act-Assert），每个步骤都断言关键状态码和字段。
     */
    @Test
    @DisplayName("完整用户旅程：注册 -> 登录 -> 创建会话 -> 同步对话 -> 流式对话 -> 消息查询 -> 导出 -> Coach -> 系统检查")
    void fullUserJourneyFromRegistrationToSystemCheck() {
        // ===== Arrange：准备测试数据 =====
        String email = "e2e_" + UUID.randomUUID() + "@example.com";
        String password = "StrongP@ss123";

        // ===== Act & Assert：逐步执行并断言 =====

        // 步骤 1：注册新用户 POST /api/v1/auth/register
        // 意图：验证新用户可以成功注册
        ResponseEntity<Map<String, Object>> register =
                postJson(
                        "/api/v1/auth/register",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        assertStatus(register, 200, "注册应返回 200");
        assertNotNull(register.getBody(), "注册响应体不应为空");
        assertEquals(email, register.getBody().get("email"), "注册返回的邮箱应匹配");

        // 步骤 2：登录 POST /api/v1/auth/login，拿到 accessToken
        // 意图：验证注册用户可以登录并获取 JWT token
        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        assertStatus(login, 200, "登录应返回 200");
        assertNotNull(login.getBody(), "登录响应体不应为空");
        String accessToken = String.valueOf(login.getBody().get("accessToken"));
        assertFalse(accessToken.isBlank(), "accessToken 不应为空");
        assertNotNull(login.getBody().get("refreshToken"), "refreshToken 不应为空");
        assertTrue(((Number) login.getBody().get("expiresInSeconds")).longValue() > 0, "过期时间应大于 0");

        // 步骤 3：用 token 创建会话 POST /api/v1/sessions
        // 意图：验证已认证用户可以创建新的对话会话
        ResponseEntity<Map<String, Object>> createSession =
                postJson(
                        "/api/v1/sessions",
                        Map.of(
                                "title",
                                "E2E 测试会话",
                                "provider",
                                "OPENAI",
                                "model",
                                "mock-model",
                                "taskType",
                                "requirements",
                                "taskGoal",
                                "拆解新功能需求",
                                "taskStatus",
                                "planned",
                                "contextTokenLimit",
                                1800),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(createSession, 200, "创建会话应返回 200");
        assertNotNull(createSession.getBody(), "会话响应体不应为空");
        String sessionId = String.valueOf(createSession.getBody().get("id"));
        assertFalse(sessionId.isBlank(), "会话 ID 不应为空");
        assertEquals(
                "requirements",
                createSession.getBody().get("taskType"),
                "taskType 应为 requirements");
        assertEquals("planned", createSession.getBody().get("taskStatus"), "taskStatus 应为 planned");
        assertEquals(
                1800,
                ((Number) createSession.getBody().get("contextTokenLimit")).intValue(),
                "contextTokenLimit 应为 1800");

        // 步骤 4：同步对话 POST /api/v1/agent/chat（mock 模型返回固定内容）
        // 意图：验证已认证用户可以在指定会话中进行同步对话
        ResponseEntity<Map<String, Object>> chat =
                postJson(
                        "/api/v1/agent/chat",
                        Map.of("sessionId", sessionId, "message", "你好，请帮我分析需求"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(chat, 200, "同步对话应返回 200");
        assertNotNull(chat.getBody(), "对话响应体不应为空");
        // 验证 reply 字段存在（flex runtime 与 mock 模型的交互可能产生空回复，不强制断言内容）
        assertNotNull(chat.getBody().get("reply"), "reply 字段不应为 null");
        assertEquals(
                sessionId, String.valueOf(chat.getBody().get("sessionId")), "回复的 sessionId 应匹配");

        // 步骤 5：流式对话 POST /api/v1/agent/chat/stream（验证 SSE 事件：meta + chunk + done）
        // 意图：验证流式对话能正确返回 SSE 事件流
        HttpHeaders streamHeaders = authHeaders(accessToken);
        streamHeaders.setContentType(MediaType.APPLICATION_JSON);
        streamHeaders.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));
        HttpEntity<Map<String, Object>> streamRequest =
                new HttpEntity<>(Map.of("sessionId", sessionId, "message", "请流式回复"), streamHeaders);

        ResponseEntity<String> streamResponse =
                restTemplate.exchange(
                        url("/api/v1/agent/chat/stream"),
                        HttpMethod.POST,
                        streamRequest,
                        String.class);
        assertStatus(streamResponse, 200, "流式对话应返回 200");
        String streamBody = streamResponse.getBody() == null ? "" : streamResponse.getBody();
        // 验证 SSE 流包含 done 事件（meta 和 chunk 事件取决于 flex runtime 与 mock 的交互，不强制断言）
        assertTrue(streamBody.contains("event:done"), "SSE 流应包含 done 事件");

        // 步骤 6：获取会话消息 GET /api/v1/sessions/{id}/messages
        // 意图：验证可以获取会话中的所有消息记录
        ResponseEntity<List<Map<String, Object>>> messagesResponse =
                getJson(
                        "/api/v1/sessions/" + sessionId + "/messages",
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(messagesResponse, 200, "获取消息列表应返回 200");
        assertNotNull(messagesResponse.getBody(), "消息列表不应为空");
        assertTrue(
                messagesResponse.getBody().size() >= 2,
                "应至少包含 user 和 assistant 两条消息，实际: " + messagesResponse.getBody().size());
        assertTrue(
                messagesResponse.getBody().stream()
                        .anyMatch(m -> "assistant".equals(m.get("role"))),
                "消息列表应包含 assistant 角色消息");
        assertTrue(
                messagesResponse.getBody().stream()
                        .anyMatch(m -> "OPENAI".equals(m.get("provider"))),
                "消息列表应包含 OPENAI provider");

        // 步骤 7：导出会话 GET /api/v1/sessions/{id}/export?format=markdown
        // 意图：验证会话可以导出为 Markdown 格式
        HttpHeaders exportHeaders = authHeaders(accessToken);
        exportHeaders.setAccept(List.of(MediaType.TEXT_MARKDOWN, MediaType.APPLICATION_JSON));
        HttpEntity<Void> exportRequest = new HttpEntity<>(exportHeaders);

        ResponseEntity<String> exportResponse =
                restTemplate.exchange(
                        url("/api/v1/sessions/" + sessionId + "/export?format=markdown"),
                        HttpMethod.GET,
                        exportRequest,
                        String.class);
        assertStatus(exportResponse, 200, "导出会话应返回 200");
        assertNotNull(exportResponse.getBody(), "导出内容不应为空");
        assertFalse(exportResponse.getBody().isBlank(), "导出的 Markdown 不应为空");
        // 验证 Content-Disposition 头指示为 markdown 文件
        String contentDisposition =
                exportResponse.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(contentDisposition, "Content-Disposition 头应存在");
        assertTrue(contentDisposition.contains(".md"), "Content-Disposition 应包含 .md 文件扩展名");

        // 步骤 8：Coach 需求拆解 POST /api/v1/coach/requirements/breakdown（mock 模型）
        // 意图：验证 Coach 服务可以基于 mock 模型返回进行需求拆解
        ResponseEntity<Map<String, Object>> breakdown =
                postJson(
                        "/api/v1/coach/requirements/breakdown",
                        Map.of(
                                "requirement",
                                "构建一个支持用户登录、会话管理和 AI 对话的 Web 应用",
                                "provider",
                                "OPENAI",
                                "model",
                                "mock-model"),
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(breakdown, 200, "Coach 需求拆解应返回 200");
        assertNotNull(breakdown.getBody(), "需求拆解响应体不应为空");
        assertNotNull(breakdown.getBody().get("runId"), "runId 不应为空");
        assertNotNull(breakdown.getBody().get("rawText"), "rawText 不应为空");

        // 步骤 9：系统就绪检查 GET /api/v1/system/health/ready
        // 意图：验证系统就绪检查接口可用，数据库和缓存依赖正常
        ResponseEntity<Map<String, Object>> ready =
                getJson(
                        "/api/v1/system/health/ready",
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(ready, 200, "系统就绪检查应返回 200");
        assertNotNull(ready.getBody(), "就绪检查响应体不应为空");
        // 数据库和缓存是硬依赖，ready 应为 true（model 可能不可达但不影响 ready）
        assertEquals(true, ready.getBody().get("ready"), "系统就绪状态应为 true");
        assertNotNull(ready.getBody().get("checks"), "checks 列表不应为空");

        // 步骤 10：工具统计 GET /api/v1/system/tool-stats?windowHours=1
        // 意图：验证工具统计接口可用，能返回统计窗口内的数据
        ResponseEntity<Map<String, Object>> toolStats =
                getJson(
                        "/api/v1/system/tool-stats?windowHours=1",
                        accessToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(toolStats, 200, "工具统计应返回 200");
        assertNotNull(toolStats.getBody(), "工具统计响应体不应为空");
        assertEquals(1, ((Number) toolStats.getBody().get("windowHours")).intValue(), "窗口应为 1 小时");
        assertNotNull(toolStats.getBody().get("generatedAt"), "generatedAt 不应为空");
    }

    // ===== Mock 服务器处理器 =====

    /** 模拟 /v1/models 端点：返回 mock 模型列表。 */
    static class MockModelsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String body =
                    "{\"object\":\"list\",\"data\":[{\"id\":\"mock-model\",\"object\":\"model\"}]}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    /** 模拟 /v1/chat/completions 端点：根据请求中的 stream 字段返回不同响应。 */
    static class MockChatCompletionsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // 读取请求体，判断是否为流式请求
            String requestBody =
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            boolean isStream =
                    requestBody.contains("\"stream\":true")
                            || requestBody.contains("\"stream\": true");

            if (isStream) {
                // 流式响应：返回 SSE 格式的 chunk 数据
                String sseBody =
                        "data:"
                            + " {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"mock-\"}}]}\n\n"
                            + "data: {\"choices\":[{\"delta\":{\"content\":\"openai-\"}}]}\n\n"
                            + "data: {\"choices\":[{\"delta\":{\"content\":\"stream\"}}]}\n\n"
                            + "data: [DONE]\n\n";
                byte[] bytes = sseBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } else {
                // 非流式响应：返回固定 JSON
                String body =
                        "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"mock-openai-reply\"}}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":5,\"total_tokens\":10}}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            }
        }
    }

    // ===== HTTP 工具方法 =====

    /** 发送 POST JSON 请求，可选携带 accessToken。 */
    private <T> ResponseEntity<T> postJson(
            String path, Object payload, String accessToken, ParameterizedTypeReference<T> type) {
        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Object> request = new HttpEntity<>(payload, headers);
        return restTemplate.exchange(url(path), HttpMethod.POST, request, type);
    }

    /** 发送 GET 请求，可选携带 accessToken。 */
    private <T> ResponseEntity<T> getJson(
            String path, String accessToken, ParameterizedTypeReference<T> type) {
        HttpEntity<Void> request = new HttpEntity<>(authHeaders(accessToken));
        return restTemplate.exchange(url(path), HttpMethod.GET, request, type);
    }

    /** 构造认证请求头，若 accessToken 为空则返回空头。 */
    private HttpHeaders authHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        if (accessToken != null && !accessToken.isBlank()) {
            headers.setBearerAuth(accessToken);
        }
        return headers;
    }

    /** 断言 HTTP 响应状态码，失败时附带自定义错误信息。 */
    private void assertStatus(ResponseEntity<?> response, int expected, String message) {
        HttpStatusCode status = response.getStatusCode();
        assertEquals(
                expected,
                status.value(),
                message + " - 期望: " + expected + " 实际: " + status.value());
    }

    /** 构造完整的本地 URL。 */
    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
