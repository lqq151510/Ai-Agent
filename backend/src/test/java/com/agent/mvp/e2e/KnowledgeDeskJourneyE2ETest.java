package com.agent.mvp.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
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
 * Knowledge Desk 核心链路端到端测试（离线、可 CI 运行）。
 *
 * <p>覆盖产品主线的五步链路，全程使用真实 HTTP + 真实 Spring 上下文（H2 内存库 + Flyway db/h2 迁移）：
 *
 * <ol>
 *   <li><b>导入</b>：snippet / web / file 三个入口 + preflight 预检 + 不支持 sourceType 的 400 边界
 *   <li><b>整理</b>：单条 organize、organize-batch、reprocess，以及归档后不可整理的 400 边界
 *   <li><b>检索</b>：search（关键词/状态过滤）、分页列表、详情、标签写入与幂等
 *   <li><b>复习</b>：queue（安全精简 DTO）、complete（间隔算法精确值）、summary、400/403 边界
 *   <li><b>助手</b>：会话 + 同步/流式对话 + 会话导出，并断言<b>导入的知识确实进入了模型上下文</b>
 * </ol>
 *
 * <p>知识闭环断言的实现方式：内置 HttpServer 同时模拟 OpenAI 兼容的 {@code /v1/models}、{@code
 * /v1/chat/completions} 与 {@code /v1/embeddings}。整理成功后 {@code KnowledgeItemService} 会异步把条目正文写入
 * embedding store，助手每轮对话又会用用户消息检索该 store 并把命中内容拼进 system prompt；因此本测试在 mock
 * 侧捕获 {@code /v1/chat/completions} 的请求体，断言其中包含导入内容的唯一标记。
 *
 * <p>注意：应用侧 {@code app.local-vector-store.enabled=false}（来自 application-test.yml）只关闭磁盘持久化，
 * 内存 embedding store 仍然生效，这正是本测试可以离线断言知识闭环的原因。
 */
@DisplayName("Knowledge Desk 核心链路 E2E：导入 → 整理 → 检索 → 复习 → 助手")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles({"desktop", "test"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class KnowledgeDeskJourneyE2ETest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int EMBEDDING_DIMENSIONS = 384;
    private static final String MOCK_MODEL = "mock-model";
    private static final Duration INGEST_WAIT = Duration.ofSeconds(30);

    /** mock 侧捕获的 /v1/chat/completions 请求体（用于断言知识进入上下文）。 */
    static final List<String> chatRequestBodies = new CopyOnWriteArrayList<>();

    /** mock 侧收到的 embedding 输入文本（用于等待异步 ingest 完成）。 */
    static final List<String> embeddingInputs = new CopyOnWriteArrayList<>();

    static HttpServer mockServer;
    static int mockPort;

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
        chatRequestBodies.clear();
        embeddingInputs.clear();
        mockServer = HttpServer.create(new InetSocketAddress(0), 0);
        mockPort = mockServer.getAddress().getPort();
        mockServer.createContext("/v1/models", new MockModelsHandler());
        mockServer.createContext("/v1/chat/completions", new MockChatCompletionsHandler());
        mockServer.createContext("/v1/embeddings", new MockEmbeddingsHandler());
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
        registry.add("app.openai.base-url", () -> "http://localhost:" + mockPort + "/v1");
        registry.add("app.openai.api-key", () -> "sk-e2e-key");
        // 独立内存库，避免与其他 E2E 上下文共用 ai_agent_e2e 造成 Flyway 历史串扰。
        registry.add(
                "spring.datasource.url",
                () ->
                        "jdbc:h2:mem:kd_e2e_"
                                + UUID.randomUUID().toString().replace("-", "")
                                + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL");
        // 桌面 profile 默认把 data-dir 指到 ~/.ai-agent-desktop，测试里重定向到 target/ 下。
        registry.add("app.data-dir", () -> Path.of("target", "kd-e2e-data").toAbsolutePath().toString());
        registry.add(
                "logging.file.name",
                () -> Path.of("target", "kd-e2e-data", "backend-e2e.log").toAbsolutePath().toString());
    }

    // ==================================================================================
    // 1. 主链路：导入 → 整理 → 检索 → 复习 → 助手
    // ==================================================================================

    @Test
    @Order(1)
    @DisplayName("五步链路：导入 snippet/web/file → 整理 ready → 检索命中 → 复习间隔 → 助手引用导入资料")
    void knowledgeDeskFiveStepJourney() {
        String token = registerAndLogin();
        String marker = "KD-E2E-" + UUID.randomUUID();
        String snippetContent =
                "端到端链路标记 " + marker + "：本机知识工作台导入的内容会被整理、检索、复习，并进入助手上下文。";

        // ---------- 步骤 1：导入 ----------
        Map<String, Object> snippet = importSnippet(token, "链路标记片段", snippetContent);
        String snippetId = id(snippet);
        assertEquals("inbox", snippet.get("status"), "手动整理模式下导入后应停留在 inbox");
        assertEquals("snippet", snippet.get("sourceType"), "snippet 入口的 sourceType 应为 snippet");
        assertEquals("链路标记片段", snippet.get("title"), "标题应原样保存");
        assertTrue(((Number) snippet.get("wordCount")).intValue() > 0, "应统计出字数");

        Map<String, Object> web =
                importWeb(
                        token,
                        "网页资料 " + marker,
                        "https://example.com/kd-e2e/" + marker,
                        "网页正文 " + marker + " 用于验证 web 入口。");
        String webId = id(web);
        assertEquals("web", web.get("sourceType"), "web 入口的 sourceType 应为 web");
        assertEquals("inbox", web.get("status"), "web 入口导入后应为 inbox");

        Map<String, Object> file =
                importFile(
                        token,
                        "Markdown 笔记 " + marker,
                        "markdown",
                        "/tmp/kd-e2e/" + marker + ".md",
                        "# 笔记\n\nMarkdown 正文 " + marker);
        String fileId = id(file);
        assertEquals("markdown", file.get("sourceType"), "file 入口的 sourceType 应为 markdown");

        // 边界：file 入口只接受 markdown / pdf
        ResponseEntity<Map<String, Object>> badSourceType =
                postJson(
                        "/api/v1/knowledge-items/import/file",
                        Map.of(
                                "title", "非法来源类型",
                                "sourceType", "web",
                                "content", "should be rejected"),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(badSourceType, 400, "file 入口传入 sourceType=web 应返回 400");

        // 边界：preflight 只回显当前用户已存在的哈希
        String unknownHash = sha256Hex("kd-e2e-not-imported-" + marker);
        ResponseEntity<Map<String, Object>> preflight =
                postJson(
                        "/api/v1/knowledge-items/import/preflight",
                        Map.of("contentHashes", List.of(unknownHash)),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(preflight, 200, "preflight 应返回 200");
        assertEquals(
                List.of(),
                preflight.getBody().get("existingContentHashes"),
                "未导入过的哈希不应出现在 preflight 结果中");

        ResponseEntity<Map<String, Object>> badPreflight =
                postJson(
                        "/api/v1/knowledge-items/import/preflight",
                        Map.of("contentHashes", List.of("not-a-sha256")),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(badPreflight, 400, "非法哈希应返回 400");

        // 语义记录：snippet 入口不做内容去重（去重只针对 upload 的字节哈希）
        Map<String, Object> duplicate = importSnippet(token, "重复片段", snippetContent);
        assertNotEquals(snippetId, id(duplicate), "snippet 入口允许同内容重复导入（无字节哈希去重）");

        // ---------- 步骤 2：整理 ----------
        Map<String, Object> organized = organize(token, snippetId);
        assertEquals("ready", organized.get("status"), "整理成功后状态应为 ready");
        assertNotNull(organized.get("summary"), "整理应生成摘要");
        assertFalse(String.valueOf(organized.get("summary")).isBlank(), "摘要不应为空");
        assertNotNull(organized.get("cleanedContent"), "整理应生成 cleanedContent");
        assertFalse(String.valueOf(organized.get("language")).isBlank(), "整理应识别语言");
        List<Map<String, Object>> organizedTags = maps(organized.get("tags"));
        assertFalse(organizedTags.isEmpty(), "整理应生成标签");

        ResponseEntity<Map<String, Object>> batch =
                postJson(
                        "/api/v1/knowledge-items/organize-batch?limit=10&includeFailed=false",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(batch, 200, "批量整理应返回 200");
        assertTrue(
                ((Number) batch.getBody().get("selectedCount")).intValue() >= 3,
                "批量整理应选中剩余 inbox 条目，实际: " + batch.getBody().get("selectedCount"));
        assertEquals(
                0,
                ((Number) batch.getBody().get("failedCount")).intValue(),
                "批量整理不应有失败条目");

        Map<String, Object> reprocessed = reprocess(token, snippetId);
        assertEquals("ready", reprocessed.get("status"), "重新整理后仍应为 ready");

        // 边界：归档后不可整理
        archive(token, webId);
        ResponseEntity<Map<String, Object>> organizeArchived =
                postJson(
                        "/api/v1/knowledge-items/" + webId + "/organize",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(organizeArchived, 400, "归档条目不可整理，应返回 400");
        restore(token, webId);

        // ---------- 步骤 3：检索 ----------
        ResponseEntity<Map<String, Object>> search =
                getJson(
                        "/api/v1/knowledge-items/search?q=" + marker,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(search, 200, "搜索应返回 200");
        assertTrue(
                ((Number) search.getBody().get("total")).longValue() >= 1,
                "按标记搜索应至少命中一条");
        assertTrue(
                maps(search.getBody().get("items")).stream()
                        .anyMatch(item -> snippetId.equals(String.valueOf(item.get("id")))),
                "搜索结果应包含 snippet 条目");

        ResponseEntity<Map<String, Object>> searchReady =
                getJson(
                        "/api/v1/knowledge-items/search?q=" + marker + "&status=ready",
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(searchReady, 200, "按状态搜索应返回 200");
        assertTrue(
                ((Number) searchReady.getBody().get("total")).longValue() >= 1,
                "ready 状态搜索应至少命中一条");

        ResponseEntity<Map<String, Object>> searchInbox =
                getJson(
                        "/api/v1/knowledge-items/search?q=" + marker + "&status=inbox",
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(searchInbox, 200, "inbox 搜索应返回 200");
        assertEquals(0L, ((Number) searchInbox.getBody().get("total")).longValue(), "整理后不应再有 inbox 命中");

        ResponseEntity<Map<String, Object>> readyList =
                getJson(
                        "/api/v1/knowledge-items?status=ready&page=1&pageSize=20",
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(readyList, 200, "列表接口应返回 200");
        assertTrue(
                ((Number) readyList.getBody().get("total")).longValue() >= 4,
                "ready 列表应包含全部整理完成的条目");

        ResponseEntity<Map<String, Object>> detail =
                getJson(
                        "/api/v1/knowledge-items/" + snippetId,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(detail, 200, "详情接口应返回 200");
        assertEquals(snippetId, String.valueOf(detail.getBody().get("id")), "详情应返回同一条目");
        assertFalse(maps(detail.getBody().get("tags")).isEmpty(), "详情应带标签");

        String manualTag = "e2e-tag-" + marker;
        String normalizedManualTag = manualTag.toLowerCase(Locale.ROOT);
        ResponseEntity<Map<String, Object>> updated =
                putJson(
                        "/api/v1/knowledge-items/" + snippetId,
                        Map.of("title", "链路标记片段（已更新）", "tags", List.of(manualTag)),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(updated, 200, "更新条目应返回 200");
        // 标签名会被服务端规范化为小写（KnowledgeItemService#normalizeTagNames）
        assertTrue(
                maps(updated.getBody().get("tags")).stream()
                        .anyMatch(tag -> normalizedManualTag.equals(String.valueOf(tag.get("name")))),
                "更新后应包含手动标签（小写规范化）");

        ResponseEntity<Map<String, Object>> createdTag =
                postJson(
                        "/api/v1/tags",
                        Map.of("name", "自定义标签-" + marker, "color", "#123456"),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(createdTag, 200, "创建标签应返回 200");
        ResponseEntity<Map<String, Object>> createdAgain =
                postJson(
                        "/api/v1/tags",
                        Map.of("name", "自定义标签-" + marker, "color", "#123456"),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(createdAgain, 200, "重复创建同名标签应幂等返回 200");
        assertEquals(
                String.valueOf(createdTag.getBody().get("id")),
                String.valueOf(createdAgain.getBody().get("id")),
                "同名标签应返回同一个 id");

        // ---------- 步骤 4：复习 ----------
        ResponseEntity<String> queueRaw =
                getRaw("/api/v1/knowledge-reviews/queue?limit=10", token);
        assertStatus(queueRaw, 200, "复习队列应返回 200");
        for (String forbidden : List.of("rawContent", "sourceUri", "contentHash", "sourceAsset")) {
            assertFalse(
                    queueRaw.getBody().contains(forbidden),
                    "复习队列是安全精简 DTO，不应包含字段: " + forbidden);
        }
        ResponseEntity<Map<String, Object>> queue =
                getJson(
                        "/api/v1/knowledge-reviews/queue?limit=10",
                        token,
                        new ParameterizedTypeReference<>() {});
        assertFalse(maps(queue.getBody().get("items")).isEmpty(), "复习队列不应为空");
        assertTrue(((Number) queue.getBody().get("dueCount")).longValue() >= 1, "应有到期条目");

        ResponseEntity<Map<String, Object>> firstReview =
                postJson(
                        "/api/v1/knowledge-reviews/" + snippetId + "/complete",
                        Map.of("rating", "good"),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(firstReview, 200, "首次复习应返回 200");
        assertEquals("good", firstReview.getBody().get("rating"), "应回显 rating");
        assertEquals(1, ((Number) firstReview.getBody().get("intervalDays")).intValue(), "首次 good 间隔为 1 天");
        assertEquals(1, ((Number) firstReview.getBody().get("repetitions")).intValue(), "首次 good 次数为 1");
        assertEquals(
                2.5,
                ((Number) firstReview.getBody().get("easeFactor")).doubleValue(),
                0.0001,
                "首次 good 的 easeFactor 应为 2.5");
        assertNotNull(firstReview.getBody().get("dueAt"), "应返回下次到期时间");

        ResponseEntity<Map<String, Object>> secondReview =
                postJson(
                        "/api/v1/knowledge-reviews/" + snippetId + "/complete",
                        Map.of("rating", "easy"),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(secondReview, 200, "第二次复习应返回 200");
        assertEquals(7, ((Number) secondReview.getBody().get("intervalDays")).intValue(), "第二次 easy 间隔为 7 天");
        assertEquals(2, ((Number) secondReview.getBody().get("repetitions")).intValue(), "第二次复习次数应为 2");
        assertEquals(
                2.65,
                ((Number) secondReview.getBody().get("easeFactor")).doubleValue(),
                0.0001,
                "第二次 easy 的 easeFactor 应为 2.65");

        // 边界：未整理条目不可复习
        Map<String, Object> inboxItem = importSnippet(token, "未整理片段 " + marker, "inbox 内容 " + marker);
        ResponseEntity<Map<String, Object>> reviewInbox =
                postJson(
                        "/api/v1/knowledge-reviews/" + id(inboxItem) + "/complete",
                        Map.of("rating", "good"),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(reviewInbox, 400, "未整理条目复习应返回 400");

        ResponseEntity<Map<String, Object>> summary =
                getJson("/api/v1/knowledge-reviews/summary", token, new ParameterizedTypeReference<>() {});
        assertStatus(summary, 200, "复习摘要应返回 200");
        assertNotNull(summary.getBody().get("dueCount"), "摘要应包含 dueCount");

        ResponseEntity<Map<String, Object>> dashboard =
                getJson("/api/v1/dashboard/summary", token, new ParameterizedTypeReference<>() {});
        assertStatus(dashboard, 200, "首页摘要应返回 200");
        assertTrue(((Number) dashboard.getBody().get("totalItems")).longValue() >= 5, "总条目数应 >= 5");
        assertTrue(((Number) dashboard.getBody().get("readyItems")).longValue() >= 4, "ready 条目数应 >= 4");
        assertNotNull(dashboard.getBody().get("review"), "首页摘要应包含 review 字段");
        assertFalse(maps(dashboard.getBody().get("topTags")).isEmpty(), "首页摘要应包含标签统计");

        // ---------- 步骤 5：助手 ----------
        String sessionId = createSession(token);
        awaitIngested(marker);

        int chatCallsBefore = chatRequestBodies.size();
        ResponseEntity<Map<String, Object>> chat =
                postJson(
                        "/api/v1/agent/chat",
                        Map.of("sessionId", sessionId, "message", "请结合我导入的资料回答：" + marker),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(chat, 200, "同步对话应返回 200");
        assertNotNull(chat.getBody().get("reply"), "对话应返回 reply 字段");
        assertEquals(sessionId, String.valueOf(chat.getBody().get("sessionId")), "回复的 sessionId 应匹配");

        String prompt = latestChatRequest(chatCallsBefore);
        assertNotNull(prompt, "mock 应捕获到 /v1/chat/completions 请求");
        assertTrue(
                prompt.contains(marker),
                "助手 system prompt 应包含刚导入的知识内容（知识闭环断言）");

        ResponseEntity<String> stream =
                postStream("/api/v1/agent/chat/stream", Map.of("sessionId", sessionId, "message", "请流式回复 " + marker), token);
        assertStatus(stream, 200, "流式对话应返回 200");
        assertTrue(stream.getBody().contains("event:done"), "SSE 流应包含 done 事件");

        ResponseEntity<List<Map<String, Object>>> messages =
                getJson(
                        "/api/v1/sessions/" + sessionId + "/messages",
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(messages, 200, "会话消息应返回 200");
        assertTrue(
                messages.getBody().stream().anyMatch(m -> "assistant".equals(m.get("role"))),
                "会话消息应包含 assistant 角色");

        ResponseEntity<String> export =
                getRaw(
                        "/api/v1/sessions/" + sessionId + "/export?format=markdown",
                        token,
                        MediaType.TEXT_MARKDOWN);
        assertStatus(export, 200, "会话导出应返回 200");
        assertFalse(export.getBody().isBlank(), "导出的 Markdown 不应为空");
        String disposition = export.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(disposition, "导出应带 Content-Disposition");
        assertTrue(disposition.contains(".md"), "导出文件名应为 .md");
    }

    @Test
    @Order(2)
    @DisplayName("复习越权与状态边界：他人条目 403、未整理条目 400、归档条目 400")
    void reviewRejectsCrossUserAndNonReadyItems() {
        String ownerToken = registerAndLogin();
        String otherToken = registerAndLogin();
        String marker = "KD-E2E-PERM-" + UUID.randomUUID();

        Map<String, Object> ready = importSnippet(ownerToken, "越权用例 " + marker, "正文 " + marker);
        String readyId = id(ready);
        organize(ownerToken, readyId);

        ResponseEntity<Map<String, Object>> crossUser =
                postJson(
                        "/api/v1/knowledge-reviews/" + readyId + "/complete",
                        Map.of("rating", "good"),
                        otherToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(crossUser, 403, "复习他人条目应返回 403");

        Map<String, Object> archived = importSnippet(ownerToken, "归档用例 " + marker, "正文 " + marker);
        String archivedId = id(archived);
        organize(ownerToken, archivedId);
        archive(ownerToken, archivedId);
        ResponseEntity<Map<String, Object>> archivedReview =
                postJson(
                        "/api/v1/knowledge-reviews/" + archivedId + "/complete",
                        Map.of("rating", "good"),
                        ownerToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(archivedReview, 400, "归档条目复习应返回 400");

        ResponseEntity<Map<String, Object>> invalidRating =
                postJson(
                        "/api/v1/knowledge-reviews/" + readyId + "/complete",
                        Map.of("rating", "not-a-rating"),
                        ownerToken,
                        new ParameterizedTypeReference<>() {});
        assertStatus(invalidRating, 400, "非法 rating 应返回 400");
    }

    @Test
    @Order(3)
    @DisplayName("未认证访问知识工作台接口应返回 401")
    void knowledgeEndpointsRequireAuthentication() {
        ResponseEntity<String> anonymous = getRaw("/api/v1/knowledge-items", null);
        assertStatus(anonymous, 401, "未认证访问知识条目列表应返回 401");
        ResponseEntity<String> anonymousQueue = getRaw("/api/v1/knowledge-reviews/queue", null);
        assertStatus(anonymousQueue, 401, "未认证访问复习队列应返回 401");
    }

    @Test
    @Order(4)
    @DisplayName("五步链路延迟基线：p50/p90/p99 + 吞吐，产物写入 artifacts/e2e/<ts>/baseline.json")
    void fiveStepLatencyBaseline() {
        int iterations = Integer.getInteger("e2e.perf.iterations", 30);
        String token = registerAndLogin();
        String marker = "KD-E2E-PERF-" + UUID.randomUUID();

        // 预热：先跑一轮，避免把 JIT/连接建立成本算进基线
        String warmId = id(importSnippet(token, "预热 " + marker, "预热正文 " + marker));
        organize(token, warmId);
        getJson("/api/v1/knowledge-items/search?q=" + marker, token, new ParameterizedTypeReference<>() {});
        getJson("/api/v1/knowledge-reviews/queue?limit=10", token, new ParameterizedTypeReference<>() {});
        String sessionId = createSession(token);
        postJson(
                "/api/v1/agent/chat",
                Map.of("sessionId", sessionId, "message", "预热 " + marker),
                token,
                new ParameterizedTypeReference<>() {});

        Map<String, List<Long>> samples = new LinkedHashMap<>();
        samples.put("import_snippet", new ArrayList<>());
        samples.put("organize", new ArrayList<>());
        samples.put("search", new ArrayList<>());
        samples.put("review_queue", new ArrayList<>());
        samples.put("assistant_chat", new ArrayList<>());

        int chatCallsBefore = chatRequestBodies.size();

        for (int i = 0; i < iterations; i++) {
            String content = "基线样本 " + i + " " + marker;

            long t0 = System.nanoTime();
            Map<String, Object> item = importSnippet(token, "基线 " + i + " " + marker, content);
            samples.get("import_snippet").add(System.nanoTime() - t0);

            String itemId = id(item);
            t0 = System.nanoTime();
            organize(token, itemId);
            samples.get("organize").add(System.nanoTime() - t0);

            t0 = System.nanoTime();
            getJson("/api/v1/knowledge-items/search?q=" + marker, token, new ParameterizedTypeReference<>() {});
            samples.get("search").add(System.nanoTime() - t0);

            t0 = System.nanoTime();
            getJson("/api/v1/knowledge-reviews/queue?limit=10", token, new ParameterizedTypeReference<>() {});
            samples.get("review_queue").add(System.nanoTime() - t0);

            // 每次使用全新随机词元，避免命中语义缓存（阈值 0.95），确保测到的是真实的模型往返路径。
            String coldPrompt =
                    "冷路径请求 " + UUID.randomUUID() + " " + UUID.randomUUID() + " " + i;
            t0 = System.nanoTime();
            postJson(
                    "/api/v1/agent/chat",
                    Map.of("sessionId", sessionId, "message", coldPrompt),
                    token,
                    new ParameterizedTypeReference<>() {});
            samples.get("assistant_chat").add(System.nanoTime() - t0);
        }

        int modelCalls = chatRequestBodies.size() - chatCallsBefore;
        String json = baselineJson(iterations, samples, modelCalls);
        System.out.println("[e2e-baseline] " + json);

        Path outDir = baselineDir().resolve(timestamp());
        try {
            Files.createDirectories(outDir);
            Files.writeString(outDir.resolve("baseline.json"), json);
            System.out.println("[e2e-baseline] 产物写入 " + outDir.resolve("baseline.json"));
        } catch (IOException ex) {
            System.out.println("[e2e-baseline] 写入产物失败（不影响断言）: " + ex.getMessage());
        }

        for (Map.Entry<String, List<Long>> entry : samples.entrySet()) {
            List<Long> values = entry.getValue();
            assertEquals(iterations, values.size(), entry.getKey() + " 采样数量应完整");
            assertTrue(percentileMillis(values, 0.50) >= 0, entry.getKey() + " p50 应可计算");
            assertTrue(
                    percentileMillis(values, 0.99) < 10_000,
                    entry.getKey() + " p99 应低于 10s（本地 mock 环境的合理性上限）");
        }
        assertEquals(
                iterations,
                modelCalls,
                "随机词元应绕过语义缓存，使每次 assistant_chat 都走真实模型往返路径");
    }

    // ==================================================================================
    // 业务操作封装
    // ==================================================================================

    private Map<String, Object> importSnippet(String token, String title, String content) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/import/snippet",
                        Map.of("title", title, "content", content),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "导入 snippet 应返回 200");
        return response.getBody();
    }

    private Map<String, Object> importWeb(String token, String title, String url, String content) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/import/web",
                        Map.of("title", title, "url", url, "content", content),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "导入网页应返回 200");
        return response.getBody();
    }

    private Map<String, Object> importFile(
            String token, String title, String sourceType, String sourceUri, String content) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/import/file",
                        Map.of(
                                "title", title,
                                "sourceType", sourceType,
                                "sourceUri", sourceUri,
                                "content", content),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "导入本地文件应返回 200");
        return response.getBody();
    }

    private Map<String, Object> organize(String token, String itemId) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/" + itemId + "/organize",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "整理条目应返回 200");
        return response.getBody();
    }

    private Map<String, Object> reprocess(String token, String itemId) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/" + itemId + "/reprocess",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "重新整理应返回 200");
        return response.getBody();
    }

    private void archive(String token, String itemId) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/" + itemId + "/archive",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "归档应返回 200");
        assertEquals("archived", response.getBody().get("status"), "归档后状态应为 archived");
    }

    private void restore(String token, String itemId) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/knowledge-items/" + itemId + "/restore",
                        null,
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "恢复应返回 200");
        assertEquals("ready", response.getBody().get("status"), "恢复后状态应回到 ready");
    }

    private String createSession(String token) {
        ResponseEntity<Map<String, Object>> response =
                postJson(
                        "/api/v1/sessions",
                        Map.of("title", "KD E2E 会话", "provider", "OPENAI", "model", MOCK_MODEL),
                        token,
                        new ParameterizedTypeReference<>() {});
        assertStatus(response, 200, "创建会话应返回 200");
        return String.valueOf(response.getBody().get("id"));
    }

    /** 等待异步 ingest 把知识正文写进 embedding store（mock 侧观察到含标记的 embedding 输入）。 */
    private void awaitIngested(String marker) {
        Instant deadline = Instant.now().plus(INGEST_WAIT);
        while (Instant.now().isBefore(deadline)) {
            boolean seen =
                    embeddingInputs.stream().anyMatch(input -> input != null && input.contains(marker));
            if (seen) {
                return;
            }
            try {
                Thread.sleep(200);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        throw new AssertionError("等待异步向量入库超时（" + INGEST_WAIT.toSeconds() + "s），标记: " + marker);
    }

    private String latestChatRequest(int since) {
        if (chatRequestBodies.size() <= since) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (int i = since; i < chatRequestBodies.size(); i++) {
            sb.append(chatRequestBodies.get(i));
        }
        return sb.toString();
    }

    private String registerAndLogin() {
        String email = "kd_e2e_" + UUID.randomUUID() + "@example.com";
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
    // 基线计算
    // ==================================================================================

    private String baselineJson(int iterations, Map<String, List<Long>> samples, int modelCalls) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        sb.append("  \"generatedAt\": \"").append(Instant.now()).append("\",\n");
        sb.append("  \"profile\": \"desktop+test (H2 in-memory, Flyway db/h2)\",\n");
        sb.append("  \"iterations\": ").append(iterations).append(",\n");
        sb.append("  \"jvm\": \"").append(System.getProperty("java.version")).append("\",\n");
        sb.append("  \"os\": \"")
                .append(System.getProperty("os.name"))
                .append(' ')
                .append(System.getProperty("os.arch"))
                .append("\",\n");
        sb.append("  \"model_calls_observed\": ").append(modelCalls).append(",\n");
        sb.append(
                "  \"note\": \"assistant_chat 使用随机词元绕过语义缓存(阈值 0.95)，"
                        + "因此 model_calls_observed 应等于 iterations；"
                        + "模型为进程内 mock(OpenAI 兼容)，该列度量的是后端链路开销，不含真实 LLM 时延\",\n");
        sb.append("  \"endpoints\": {\n");
        int index = 0;
        for (Map.Entry<String, List<Long>> entry : samples.entrySet()) {
            List<Long> values = entry.getValue();
            sb.append("    \"").append(entry.getKey()).append("\": {");
            sb.append("\"samples\": ").append(values.size()).append(", ");
            sb.append("\"p50_ms\": ").append(percentileMillis(values, 0.50)).append(", ");
            sb.append("\"p90_ms\": ").append(percentileMillis(values, 0.90)).append(", ");
            sb.append("\"p99_ms\": ").append(percentileMillis(values, 0.99)).append(", ");
            sb.append("\"max_ms\": ").append(millis(values.stream().mapToLong(Long::longValue).max().orElse(0)));
            sb.append('}');
            if (++index < samples.size()) {
                sb.append(',');
            }
            sb.append('\n');
        }
        sb.append("  }\n}");
        return sb.toString();
    }

    private static double percentileMillis(List<Long> nanos, double percentile) {
        if (nanos.isEmpty()) {
            return 0d;
        }
        long[] sorted = nanos.stream().mapToLong(Long::longValue).sorted().toArray();
        int index = (int) Math.ceil(percentile * sorted.length) - 1;
        index = Math.max(0, Math.min(index, sorted.length - 1));
        return millis(sorted[index]);
    }

    private static double millis(long nanos) {
        return Math.round(nanos / 10_000d) / 100d;
    }

    private static String timestamp() {
        return java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                .withZone(java.time.ZoneOffset.UTC)
                .format(Instant.now());
    }

    /**
     * 基线产物目录：仓库根目录下的 {@code artifacts/e2e}。
     *
     * <p>Surefire 的 {@code user.dir} 是模块目录（backend/），因此这里显式向上定位仓库根，避免产物落到
     * {@code backend/artifacts}；也支持用 {@code -De2e.baseline.dir=<path>} 覆盖。
     */
    private static Path baselineDir() {
        String override = System.getProperty("e2e.baseline.dir");
        if (override != null && !override.isBlank()) {
            return Path.of(override).toAbsolutePath();
        }
        Path dir = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        if (Files.exists(dir.resolve("backend").resolve("pom.xml"))) {
            return dir.resolve("artifacts").resolve("e2e");
        }
        Path parent = dir.getParent();
        if (parent != null && Files.exists(parent.resolve("backend").resolve("pom.xml"))) {
            return parent.resolve("artifacts").resolve("e2e");
        }
        return dir.resolve("artifacts").resolve("e2e");
    }

    // ==================================================================================
    // HTTP 工具
    // ==================================================================================

    private <T> ResponseEntity<T> postJson(
            String path, Object payload, String accessToken, ParameterizedTypeReference<T> type) {
        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Object> request = new HttpEntity<>(payload, headers);
        return restTemplate.exchange(url(path), HttpMethod.POST, request, type);
    }

    private <T> ResponseEntity<T> putJson(
            String path, Object payload, String accessToken, ParameterizedTypeReference<T> type) {
        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Object> request = new HttpEntity<>(payload, headers);
        return restTemplate.exchange(url(path), HttpMethod.PUT, request, type);
    }

    private <T> ResponseEntity<T> getJson(
            String path, String accessToken, ParameterizedTypeReference<T> type) {
        HttpEntity<Void> request = new HttpEntity<>(authHeaders(accessToken));
        return restTemplate.exchange(url(path), HttpMethod.GET, request, type);
    }

    private ResponseEntity<String> getRaw(String path, String accessToken) {
        return getRaw(path, accessToken, MediaType.APPLICATION_JSON);
    }

    private ResponseEntity<String> getRaw(String path, String accessToken, MediaType accept) {
        HttpHeaders headers = authHeaders(accessToken);
        headers.setAccept(List.of(accept));
        return restTemplate.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private ResponseEntity<String> postStream(String path, Object payload, String accessToken) {
        HttpHeaders headers = authHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));
        return restTemplate.exchange(
                url(path), HttpMethod.POST, new HttpEntity<>(payload, headers), String.class);
    }

    private HttpHeaders authHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        if (accessToken != null && !accessToken.isBlank()) {
            headers.setBearerAuth(accessToken);
        }
        return headers;
    }

    private void assertStatus(ResponseEntity<?> response, int expected, String message) {
        HttpStatusCode status = response.getStatusCode();
        assertEquals(
                expected,
                status.value(),
                message + " - 期望: " + expected + " 实际: " + status.value());
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private static String id(Map<String, Object> body) {
        assertNotNull(body, "响应体不应为空");
        Object value = body.get("id");
        assertNotNull(value, "响应体应包含 id");
        return String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        if (value == null) {
            return List.of();
        }
        return (List<Map<String, Object>>) value;
    }

    private static String sha256Hex(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    // ==================================================================================
    // Mock OpenAI 兼容服务
    // ==================================================================================

    static class MockModelsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            sendJson(
                    exchange,
                    200,
                    "{\"object\":\"list\",\"data\":[{\"id\":\""
                            + MOCK_MODEL
                            + "\",\"object\":\"model\",\"created\":0,\"owned_by\":\"e2e-mock\"}]}");
        }
    }

    static class MockChatCompletionsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String requestBody =
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            chatRequestBodies.add(requestBody);

            boolean stream =
                    requestBody.contains("\"stream\":true") || requestBody.contains("\"stream\": true");
            if (stream) {
                String sse =
                        "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"e2e-\"}}]}\n\n"
                                + "data: {\"choices\":[{\"delta\":{\"content\":\"knowledge-\"}}]}\n\n"
                                + "data: {\"choices\":[{\"delta\":{\"content\":\"reply\"}}]}\n\n"
                                + "data: [DONE]\n\n";
                byte[] bytes = sse.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
                return;
            }
            sendJson(
                    exchange,
                    200,
                    "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"e2e-knowledge-reply\"}}],"
                            + "\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":5,\"total_tokens\":10}}");
        }
    }

    /** 返回确定性的 384 维向量：基于词元哈希的 bag-of-tokens + 小常量，保证同源文本相似度为正。 */
    static class MockEmbeddingsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String requestBody =
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            List<String> texts = new ArrayList<>();
            try {
                JsonNode root = MAPPER.readTree(requestBody);
                JsonNode input = root.path("input");
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
            sb.append("],\"model\":\"text-embedding-3-small\",\"usage\":{\"prompt_tokens\":1,\"total_tokens\":1}}");
            sendJson(exchange, 200, sb.toString());
        }

        private static float[] vectorFor(String text) {
            // 稀疏 bag-of-tokens 向量：共享词元越多相似度越高。
            // 这样既能让检索命中（minScore 默认 0.0），又不会让语义缓存在不同 prompt 之间误命中。
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

    private static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
