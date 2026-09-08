package com.agent.mvp.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.agent.search.SearchConfig;
import com.agent.mvp.agent.search.SearchMode;
import com.agent.mvp.agent.search.SearchStrategy;
import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.coach.agent.SandboxManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * G1（可选）：{@code SearchOrchestrator} 在真实 Spring 上下文中的接线验证。
 *
 * <p><b>重要澄清</b>：{@code SearchOrchestrator}（FTS + Vector + RRF，默认 {@code ADAPTIVE}）只服务<b>代码 RAG</b>
 * 路径：{@code RAGMemoryService.searchCodeContext} → {@code CodeRAGService}。它<b>不在</b> Knowledge Desk 的检索链路上
 * ——知识工作台的 {@code GET /api/v1/knowledge-items/search} 走 {@code KnowledgeItemService.queryItems} 的 SQL 检索
 * （{@code to_tsvector(...)}）。后续维护者不要再用它来断言"知识工作台检索"。
 *
 * <p>本用例离线可跑：mock 提供 {@code /v1/embeddings}（确定性向量）与 {@code /v1/models}，不依赖任何外部模型。
 * 断言内容：
 *
 * <ul>
 *   <li>{@code app.search.default-mode=ADAPTIVE}、融合算法为 {@code RRF}、{@code rrf-k=60}（配置接线正确）；
 *   <li>经 {@code RAGMemoryService.ingestText} 入库的文本，能被 {@code searchCodeContext} 检索回来（向量策略真实接线）；
 *   <li>输出各搜索策略的可用性，作为"FTS 在 H2 桌面 profile 下是否可用"的事实记录。
 * </ul>
 *
 * <p>边界说明：H2（MODE=PostgreSQL）不提供 {@code to_tsvector} 等 Postgres 全文检索能力，因此本 profile 下
 * <b>无法</b>断言"FTS 与 Vector 双策略经 RRF 融合后的顺序"；该融合顺序由既有单测
 * {@code SearchOrchestratorTest}（adaptive 回退、无策略达标、精确查找走 hybrid）以 mock 策略覆盖。
 */
@DisplayName("G1 SearchOrchestrator 接线：ADAPTIVE/RRF 配置 + 代码 RAG 向量检索真实可用")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles({"desktop", "test"})
class CodeRagSearchWiringE2ETest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int EMBEDDING_DIMENSIONS = 384;
    private static final Duration INGEST_WAIT = Duration.ofSeconds(30);

    static final List<String> embeddingInputs = new CopyOnWriteArrayList<>();

    static HttpServer mockServer;
    static int mockPort;

    @Autowired RAGMemoryService ragMemoryService;
    @Autowired SearchConfig searchConfig;
    @Autowired List<SearchStrategy> searchStrategies;

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
        embeddingInputs.clear();
        mockServer = HttpServer.create(new InetSocketAddress(0), 0);
        mockPort = mockServer.getAddress().getPort();
        mockServer.createContext("/v1/embeddings", new MockEmbeddingsHandler());
        mockServer.createContext(
                "/v1/models", new StaticJsonHandler("{\"object\":\"list\",\"data\":[]}"));
        mockServer.setExecutor(null);
        mockServer.start();
    }

    @AfterAll
    static void stopMockServer() {
        if (mockServer != null) {
            mockServer.stop(0);
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("app.openai.base-url", () -> "http://127.0.0.1:" + mockPort + "/v1");
        registry.add("app.openai.api-key", () -> "sk-g1-test");
        registry.add(
                "spring.datasource.url",
                () ->
                        "jdbc:h2:mem:kd_g1_"
                                + UUID.randomUUID().toString().replace("-", "")
                                + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL");
        registry.add(
                "app.data-dir",
                () -> Path.of("target", "kd-g1-data").toAbsolutePath().toString());
        registry.add(
                "logging.file.name",
                () -> Path.of("target", "kd-g1-data", "backend-g1.log").toAbsolutePath().toString());
    }

    @Test
    @DisplayName("ADAPTIVE/RRF 配置生效，且入库文本可被代码 RAG 检索命中")
    void adaptiveConfigWiredAndCodeRagRetrievalWorks() {
        // 1) 配置接线
        assertEquals(SearchMode.ADAPTIVE, searchConfig.getDefaultMode(), "默认搜索模式应为 ADAPTIVE");
        assertEquals("RRF", searchConfig.getFusion().getAlgorithm(), "融合算法应为 RRF");
        assertEquals(60, searchConfig.getFusion().getRrfK(), "rrf-k 应为 60");
        assertEquals(2, searchConfig.getMaxStrategies(), "max-strategies 应为 2");

        // 2) 策略可用性事实记录（H2 下 FTS 通常不可用，这里只记录不断言）
        List<String> availability = new ArrayList<>();
        for (SearchStrategy strategy : searchStrategies) {
            availability.add(strategy.name() + "=" + strategy.isAvailable());
        }
        System.out.println("[g1-wiring] strategies=" + availability);

        // 3) 真实入库 + 检索（向量策略）
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        String marker = "KD-G1-" + UUID.randomUUID();
        String text = "代码 RAG 接线验证 " + marker + " SearchOrchestrator 只服务代码检索路径。";
        ragMemoryService.ingestText(userId, itemId, text, "G1 接线样本");
        awaitEmbedded(marker);

        List<String> results = ragMemoryService.searchCodeContext(marker, 5);
        System.out.println("[g1-wiring] results=" + results.size() + " containsMarker="
                + results.stream().anyMatch(r -> r != null && r.contains(marker)));
        assertFalse(results.isEmpty(), "ADAPTIVE 模式下代码 RAG 检索应返回结果");
        assertTrue(
                results.stream().anyMatch(r -> r != null && r.contains(marker)),
                "检索结果应包含刚入库的标记文本");
    }

    /** 等待 embedding 调用被 mock 观察到（入库是同步的，这里只做有界确认）。 */
    private void awaitEmbedded(String marker) {
        Instant deadline = Instant.now().plus(INGEST_WAIT);
        while (Instant.now().isBefore(deadline)) {
            if (embeddingInputs.stream().anyMatch(input -> input != null && input.contains(marker))) {
                return;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        throw new AssertionError("等待 embedding 入库超时: " + marker);
    }

    // ==================================================================================
    // Mock OpenAI 兼容服务（仅 embeddings / models）
    // ==================================================================================

    static class MockEmbeddingsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String requestBody =
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            List<String> texts = new ArrayList<>();
            try {
                JsonNode input = MAPPER.readTree(requestBody).path("input");
                if (input.isArray()) {
                    input.forEach(node -> texts.add(node.asText()));
                } else if (input.isTextual()) {
                    texts.add(input.asText());
                }
            } catch (Exception ex) {
                texts.clear();
            }
            if (texts.isEmpty()) {
                texts.add("");
            }
            embeddingInputs.addAll(texts);

            StringBuilder sb = new StringBuilder("{\"object\":\"list\",\"data\":[");
            for (int i = 0; i < texts.size(); i++) {
                if (i > 0) {
                    sb.append(',');
                }
                float[] vector = vectorFor(texts.get(i));
                sb.append("{\"object\":\"embedding\",\"index\":").append(i).append(",\"embedding\":[");
                for (int d = 0; d < vector.length; d++) {
                    if (d > 0) {
                        sb.append(',');
                    }
                    sb.append(String.format(Locale.ROOT, "%.6f", vector[d]));
                }
                sb.append("]}");
            }
            sb.append(
                    "],\"model\":\"text-embedding-3-small\",\"usage\":{\"prompt_tokens\":1,\"total_tokens\":1}}");
            sendJson(exchange, 200, sb.toString());
        }

        /** 稀疏 bag-of-tokens：共享词元越多相似度越高（minScore 默认 0.0，任何正相似度都会命中）。 */
        private static float[] vectorFor(String text) {
            float[] vector = new float[EMBEDDING_DIMENSIONS];
            if (text != null) {
                for (String token : text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
                    if (token.isBlank()) {
                        continue;
                    }
                    vector[Math.floorMod(token.hashCode(), EMBEDDING_DIMENSIONS)] += 1.0f;
                }
            }
            for (float value : vector) {
                if (value != 0f) {
                    return vector;
                }
            }
            vector[0] = 1.0f;
            return vector;
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

    private static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
