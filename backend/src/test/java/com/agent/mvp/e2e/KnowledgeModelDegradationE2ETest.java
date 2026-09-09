package com.agent.mvp.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.coach.agent.SandboxManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
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
 * G2：断言「模型不可用不阻塞知识管理」（README 主产品承诺）的端到端降级行为。
 *
 * <p>覆盖三种"模型不可用"形态，全部离线可跑、不依赖任何外部模型服务：
 *
 * <ol>
 *   <li><b>未配置模型源</b>：整理走本地启发式，{@code organizationStrategy=heuristic}；
 *   <li><b>模型源连通性探测通过、但实际整理调用失败</b>：证明降级发生在<b>运行期调用失败</b>路径上， {@code
 *       organizationStrategy=heuristic_fallback}（这是最容易回归的一条：只要有人把模型调用改成硬依赖， 或把异常从 catch
 *       里放出去，本用例立刻变红）；
 *   <li><b>模型源已配置但不可达</b>：源未通过探测（{@code lastCheckStatus != ok}）时被跳过，仍返回 ready。
 * </ol>
 *
 * <p>三种形态都断言：HTTP 200、{@code status=ready}、{@code summary} 非空、{@code language}/{@code tags} 可用，
 * 并断言整理耗时低于 30s（模型不可用时不得把请求挂在超时上），同时在 {@code ingestion_jobs.result_snapshot} 中核对实际落库的 {@code
 * organizationStrategy} 取值。
 *
 * <p>说明：{@code SearchOrchestrator}（FTS/Vector/RRF）只服务代码 RAG 路径 （{@code
 * RAGMemoryService.searchCodeContext} → {@code CodeRAGService}），**不在** Knowledge Desk 的检索链路上 （后者走
 * {@code KnowledgeItemService.queryItems} 的 SQL FTS）。因此本用例不通过它来断言知识工作台检索。
 */
@DisplayName("G2 模型不可用降级：无模型源 / 调用失败 / 源不可达 三种形态都不阻塞知识管理")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles({"desktop", "test"})
class KnowledgeModelDegradationE2ETest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String MOCK_MODEL = "degradation-mock-model";
    private static final Duration ORGANIZE_UPPER_BOUND = Duration.ofSeconds(30);

    /** mock 收到的"整理请求"（非探测）次数，用于证明降级发生在模型调用失败路径上。 */
    static final AtomicInteger organizeCalls = new AtomicInteger();

    /** mock 收到的探测请求次数。 */
    static final AtomicInteger probeCalls = new AtomicInteger();

    static HttpServer mockServer;
    static int mockPort;
    static int closedPort;

    @LocalServerPort int port;

    @Autowired TestRestTemplate restTemplate;

    @TestConfiguration
    static class E2eTestConfiguration {
        @Bean
        @Primary
        public SandboxManager sandboxManager(ObjectMapper objectMapper) {
            return new SandboxManager(System.getProperty("user.dir"), objectMapper);
        }
    }

    @BeforeAll
    static void startMockServer() throws IOException {
        organizeCalls.set(0);
        probeCalls.set(0);
        mockServer = HttpServer.create(new InetSocketAddress(0), 0);
        mockPort = mockServer.getAddress().getPort();
        mockServer.createContext("/v1/chat/completions", new FlakyModelHandler());
        mockServer.createContext(
                "/v1/models", new StaticJsonHandler("{\"object\":\"list\",\"data\":[]}"));
        mockServer.setExecutor(null);
        mockServer.start();
        closedPort = freeClosedPort();
    }

    @AfterAll
    static void stopMockServer() {
        if (mockServer != null) {
            mockServer.stop(0);
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        // 独立的 H2 内存库，避免与其他 E2E 上下文串扰。
        registry.add(
                "spring.datasource.url",
                () ->
                        "jdbc:h2:mem:kd_degrade_"
                                + UUID.randomUUID().toString().replace("-", "")
                                + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL");
        registry.add(
                "app.data-dir",
                () -> Path.of("target", "kd-degrade-data").toAbsolutePath().toString());
        registry.add(
                "logging.file.name",
                () ->
                        Path.of("target", "kd-degrade-data", "backend-degrade.log")
                                .toAbsolutePath()
                                .toString());
        // 应用级模型端点指向一个必然失败的地址：本用例只通过"模型源"驱动模型路径。
        registry.add("app.openai.base-url", () -> "http://127.0.0.1:" + closedPort + "/v1");
        registry.add("app.openai.api-key", () -> "sk-degrade-test");
    }

    // ==================================================================================

    @Test
    @DisplayName("形态一：未配置模型源 → 整理仍成功，organizationStrategy=heuristic")
    void organizeSucceedsWithoutAnyModelSource() {
        String token = registerAndLogin();
        String marker = "KD-G2-NOSRC-" + UUID.randomUUID();
        String itemId = importSnippet(token, "无模型源样本 " + marker, "中文正文 " + marker);

        OrganizeOutcome outcome = organize(token, itemId);

        assertEquals("ready", outcome.status(), "未配置模型源时整理必须成功并进入 ready");
        assertFalse(outcome.summary().isBlank(), "本地启发式必须产出摘要");
        assertFalse(outcome.language().isBlank(), "本地启发式必须识别语言");
        assertEquals("heuristic", outcome.strategy(), "未配置模型源时应走本地启发式整理（无模型依赖）");
        assertTrue(
                outcome.elapsedMs() < ORGANIZE_UPPER_BOUND.toMillis(),
                "整理耗时应在 30s 以内，实际 " + outcome.elapsedMs() + "ms");
    }

    @Test
    @DisplayName("形态二：模型源探测通过但整理调用失败 → organizationStrategy=heuristic_fallback")
    void organizeFallsBackWhenModelCallFails() {
        String token = registerAndLogin();
        String marker = "KD-G2-FAIL-" + UUID.randomUUID();

        // 1) 注册一个"探测能过、真正整理会失败"的模型源
        String sourceId =
                createModelSource(
                        token, "降级模型源 " + marker, "http://127.0.0.1:" + mockPort + "/v1", true);
        // 2) 触发连通性探测，使 lastCheckStatus=ok（否则源会被直接跳过，测不到 fallback 分支）
        ResponseEntity<Map<String, Object>> tested =
                postJson(
                        "/api/v1/model-sources/" + sourceId + "/test",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(tested, 200, "模型源连通性测试应返回 200");
        assertEquals("ok", tested.getBody().get("status"), "探测应通过（mock 对探测请求返回合法响应）");
        assertTrue(probeCalls.get() >= 1, "mock 应收到探测请求");

        int organizeCallsBefore = organizeCalls.get();

        // 3) 整理：mock 对"整理请求"返回 500，必须降级而不是 5xx/超时
        String itemId = importSnippet(token, "调用失败样本 " + marker, "中文正文 " + marker);
        OrganizeOutcome outcome = organize(token, itemId);

        assertEquals("ready", outcome.status(), "模型调用失败时整理仍必须成功并进入 ready");
        assertFalse(outcome.summary().isBlank(), "降级路径必须产出摘要");
        assertFalse(outcome.tags().isEmpty(), "降级路径必须产出标签");
        assertEquals("heuristic_fallback", outcome.strategy(), "模型调用失败时应降级为 heuristic_fallback");
        assertTrue(organizeCalls.get() > organizeCallsBefore, "必须真的发起过模型调用（否则测的不是运行期降级路径）");
        assertTrue(
                outcome.elapsedMs() < ORGANIZE_UPPER_BOUND.toMillis(),
                "模型失败后不得挂在超时上，实际 " + outcome.elapsedMs() + "ms");
    }

    @Test
    @DisplayName("形态三：模型源已配置但不可达 → 跳过该源，整理仍 ready")
    void organizeSucceedsWhenConfiguredModelSourceIsUnreachable() {
        String token = registerAndLogin();
        String marker = "KD-G2-UNREACH-" + UUID.randomUUID();

        String sourceId =
                createModelSource(
                        token, "不可达模型源 " + marker, "http://127.0.0.1:" + closedPort + "/v1", true);

        // 探测失败 → ModelSourceService.test 抛出 BadGatewayException（502），但会在抛错前把
        // lastCheckStatus 落库为 error；因此整理时该源不合格，直接走本地启发式。
        ResponseEntity<Map<String, Object>> tested =
                postJson(
                        "/api/v1/model-sources/" + sourceId + "/test",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(tested, 502, "不可达模型源的测试接口返回 502（BadGateway，产品既有行为）");
        // 注意：ModelSourceService.test 在 @Transactional 内先写 lastCheckStatus=error 再抛
        // BadGatewayException，事务回滚会把该状态丢掉，因此实际取值为 unknown。
        // 这里只断言"不是 ok"（源不可用），既符合当前事实，也不会因将来修复回滚问题而变红。
        String checkStatus = modelSourceCheckStatus(token, sourceId);
        assertFalse("ok".equalsIgnoreCase(checkStatus), "探测失败的模型源不得标记为 ok，实际: " + checkStatus);

        String itemId = importSnippet(token, "不可达源样本 " + marker, "中文正文 " + marker);
        OrganizeOutcome outcome = organize(token, itemId);

        assertEquals("ready", outcome.status(), "模型源不可达时整理仍必须成功");
        assertFalse(outcome.summary().isBlank(), "降级路径必须产出摘要");
        assertTrue(
                List.of("heuristic", "heuristic_fallback").contains(outcome.strategy()),
                "策略应为本地降级，实际: " + outcome.strategy());
        assertTrue(
                outcome.elapsedMs() < ORGANIZE_UPPER_BOUND.toMillis(),
                "不可达源不得拖慢整理，实际 " + outcome.elapsedMs() + "ms");
    }

    // ==================================================================================
    // 业务操作
    // ==================================================================================

    private record OrganizeOutcome(
            String status,
            String summary,
            String language,
            String strategy,
            List<String> tags,
            long elapsedMs) {}

    private OrganizeOutcome organize(String token, String itemId) {
        long started = System.nanoTime();
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/" + itemId + "/organize",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
        assertStatus(response, 200, "模型不可用时整理必须返回 200（不得 5xx）");

        Map<String, Object> body = response.getBody();
        assertNotNull(body, "整理响应体不应为空");
        String strategy = organizationStrategyFromJob(token, itemId);
        System.out.println(
                "[g2-degradation] item="
                        + itemId
                        + " status="
                        + body.get("status")
                        + " strategy="
                        + strategy
                        + " summaryChars="
                        + String.valueOf(body.get("summary")).length()
                        + " elapsedMs="
                        + elapsedMs);
        return new OrganizeOutcome(
                String.valueOf(body.get("status")),
                String.valueOf(body.get("summary")),
                String.valueOf(body.get("language")),
                strategy,
                maps(body.get("tags")).stream()
                        .map(tag -> String.valueOf(tag.get("name")))
                        .toList(),
                elapsedMs);
    }

    /** 从 ingestion_jobs.result_snapshot 读取真实落库的 organizationStrategy。 */
    private String organizationStrategyFromJob(String token, String itemId) {
        ResponseEntity<List<Map<String, Object>>> jobs =
                getJson(
                        "/api/v1/ingestion-jobs?knowledgeItemId=" + itemId + "&limit=20",
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(jobs, 200, "任务流水查询应返回 200");
        assertNotNull(jobs.getBody(), "任务流水不应为空");
        assertFalse(jobs.getBody().isEmpty(), "整理后应存在任务流水记录");
        for (Map<String, Object> job : jobs.getBody()) {
            Object snapshot = job.get("resultSnapshot");
            if (snapshot == null || String.valueOf(snapshot).isBlank()) {
                continue;
            }
            try {
                JsonNode node = MAPPER.readTree(String.valueOf(snapshot));
                JsonNode strategy = node.path("organizationStrategy");
                if (strategy.isTextual()) {
                    return strategy.asText();
                }
            } catch (Exception ex) {
                // 继续找下一条
            }
        }
        throw new AssertionError("未在 ingestion_jobs.result_snapshot 中找到 organizationStrategy");
    }

    /** 读取模型源的 lastCheckStatus（ok / error / unknown）。 */
    private String modelSourceCheckStatus(String token, String sourceId) {
        ResponseEntity<List<Map<String, Object>>> sources =
                getJson("/api/v1/model-sources", token, new ParameterizedTypeReference<>() {});
        assertStatus(sources, 200, "模型源列表应返回 200");
        for (Map<String, Object> source : sources.getBody()) {
            if (sourceId.equals(String.valueOf(source.get("id")))) {
                return String.valueOf(source.get("lastCheckStatus"));
            }
        }
        throw new AssertionError("未找到模型源: " + sourceId);
    }

    private String createModelSource(String token, String name, String baseUrl, boolean asDefault) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/model-sources",
                        Map.of(
                                "providerType", "local_compatible",
                                "name", name,
                                "baseUrl", baseUrl,
                                "apiKey", "sk-degrade-test",
                                "defaultModel", MOCK_MODEL,
                                "enabled", true,
                                "isDefault", asDefault),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "创建模型源应返回 200");
        assertNotNull(response.getBody(), "模型源响应体不应为空");
        return String.valueOf(response.getBody().get("id"));
    }

    private String importSnippet(String token, String title, String content) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/import/snippet",
                        Map.of("title", title, "content", content),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "导入 snippet 应返回 200");
        assertEquals("inbox", response.getBody().get("status"), "手动整理模式下导入后应为 inbox");
        return String.valueOf(response.getBody().get("id"));
    }

    private String registerAndLogin() {
        String email = "kd_g2_" + UUID.randomUUID() + "@example.com";
        String password = "StrongP@ss123";
        ResponseEntity<Map<String, Object>> register =
                postJson(
                        "/api/v1/auth/register",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        assertStatus(register, 200, "注册应返回 200");
        ResponseEntity<Map<String, Object>> login =
                postJson(
                        "/api/v1/auth/login",
                        Map.of("email", email, "password", password),
                        null,
                        new ParameterizedTypeReference<>() {});
        assertStatus(login, 200, "登录应返回 200");
        String token = String.valueOf(login.getBody().get("accessToken"));
        assertFalse(token.isBlank(), "accessToken 不应为空");
        return token;
    }

    // ==================================================================================
    // HTTP 工具
    // ==================================================================================

    private <T> ResponseEntity<T> postJson(
            String path, Object payload, String accessToken, ParameterizedTypeReference<T> type) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (accessToken != null && !accessToken.isBlank()) {
            headers.setBearerAuth(accessToken);
        }
        return restTemplate.exchange(
                url(path), HttpMethod.POST, new HttpEntity<>(payload, headers), type);
    }

    private <T> ResponseEntity<T> getJson(
            String path, String accessToken, ParameterizedTypeReference<T> type) {
        HttpHeaders headers = new HttpHeaders();
        if (accessToken != null && !accessToken.isBlank()) {
            headers.setBearerAuth(accessToken);
        }
        return restTemplate.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), type);
    }

    private void assertStatus(ResponseEntity<?> response, int expected, String message) {
        HttpStatusCode status = response.getStatusCode();
        assertEquals(expected, status.value(), message + " - 实际: " + status.value());
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        if (value == null) {
            return List.of();
        }
        return (List<Map<String, Object>>) value;
    }

    /** 取一个当前确定无人监听的端口（先占用再释放）。 */
    private static int freeClosedPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(false);
            return socket.getLocalPort();
        }
    }

    // ==================================================================================
    // Mock 模型服务：探测请求返回合法响应，整理请求返回 500
    // ==================================================================================

    static class FlakyModelHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String body =
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            boolean isProbe = body.contains("Reply with the single word: ok.");
            if (isProbe) {
                probeCalls.incrementAndGet();
                sendJson(
                        exchange,
                        200,
                        "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}]}");
                return;
            }
            organizeCalls.incrementAndGet();
            sendJson(exchange, 500, "{\"error\":{\"message\":\"simulated model outage\"}}");
        }
    }

    static class StaticJsonHandler implements HttpHandler {
        private final String body;

        StaticJsonHandler(String body) {
            this.body = body;
        }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            sendJson(exchange, 200, body);
        }
    }

    private static void sendJson(HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
