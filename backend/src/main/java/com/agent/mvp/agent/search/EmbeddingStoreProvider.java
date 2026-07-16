package com.agent.mvp.agent.search;

import com.agent.mvp.config.AppProperties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.langchain4j.store.embedding.pgvector.PgVectorEmbeddingStore;
import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 嵌入存储资源的统一持有者，负责 EmbeddingStore/EmbeddingModel 的初始化、可用性管理和查询嵌入缓存。
 *
 * <p>将原先散落在 RAGMemoryService 中的嵌入相关状态集中管理，供搜索策略和摄取流程共享。
 */
@Component
public class EmbeddingStoreProvider {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingStoreProvider.class);
    private static final Duration EMBEDDING_FAILURE_BACKOFF = Duration.ofMinutes(2);

    private final AppProperties appProperties;
    private final JdbcTemplate jdbcTemplate;

    @Value("${PG_HOST:localhost}")
    private String pgHost;

    @Value("${PG_PORT:5432}")
    private int pgPort;

    @Value("${PG_DATABASE:ai_agent}")
    private String pgDatabase;

    @Value("${PG_USERNAME:postgres}")
    private String pgUsername;

    @Value("${PG_PASSWORD:change-me}")
    private String pgPassword;

    private EmbeddingModel embeddingModel;
    private EmbeddingStore<TextSegment> embeddingStore;
    private volatile boolean pgVectorAvailable;
    private volatile boolean ftsAvailable;
    private volatile Instant embeddingDisabledUntil = Instant.EPOCH;
    private final Cache<String, Embedding> queryEmbeddingCache;

    public EmbeddingStoreProvider(AppProperties appProperties, JdbcTemplate jdbcTemplate) {
        this.appProperties = appProperties;
        this.jdbcTemplate = jdbcTemplate;
        this.queryEmbeddingCache =
                Caffeine.newBuilder()
                        .maximumSize(512)
                        .expireAfterWrite(Duration.ofMinutes(15))
                        .build();
        this.embeddingModel =
                dev.langchain4j.model.openai.OpenAiEmbeddingModel.builder()
                        .apiKey(
                                appProperties.getOpenai().getApiKey() != null
                                                && !appProperties.getOpenai().getApiKey().isBlank()
                                        ? appProperties.getOpenai().getApiKey()
                                        : "demo")
                        .baseUrl(appProperties.getOpenai().getBaseUrl())
                        .modelName("text-embedding-3-small")
                        .dimensions(384)
                        .timeout(
                                Duration.ofMillis(
                                        Math.max(
                                                1_000,
                                                appProperties
                                                        .getModelRuntime()
                                                        .getReadTimeoutMs())))
                        .maxRetries(
                                Math.max(0, appProperties.getModelRuntime().getIdempotentRetries()))
                        .build();
    }

    @PostConstruct
    public void init() {
        try {
            log.info("Initializing PgVectorEmbeddingStore with host: {}, port: {}", pgHost, pgPort);
            this.embeddingStore =
                    PgVectorEmbeddingStore.builder()
                            .host(pgHost)
                            .port(pgPort)
                            .database(pgDatabase)
                            .user(pgUsername)
                            .password(pgPassword)
                            .table("engineering_memory")
                            .dimension(384)
                            .build();
            this.pgVectorAvailable = true;
            this.ftsAvailable = initializeFtsIndex();
            log.info("PgVectorEmbeddingStore initialized successfully.");
        } catch (Exception ex) {
            log.warn(
                    "Failed to initialize PgVectorEmbeddingStore. Falling back to"
                            + " InMemoryEmbeddingStore. Error: {}",
                    ex.getMessage());
            this.embeddingStore = new InMemoryEmbeddingStore<>();
            this.pgVectorAvailable = false;
            this.ftsAvailable = false;
        }
    }

    private boolean initializeFtsIndex() {
        if (!pgVectorAvailable) {
            return false;
        }
        try {
            jdbcTemplate.execute(
                    "CREATE INDEX IF NOT EXISTS idx_engineering_memory_text_fts "
                            + "ON engineering_memory USING GIN "
                            + "(to_tsvector('english', COALESCE(text, '')))");
            return true;
        } catch (Exception ex) {
            log.warn("FTS index initialization skipped: {}", ex.getMessage());
            return false;
        }
    }

    public EmbeddingModel getEmbeddingModel() {
        return embeddingModel;
    }

    public EmbeddingStore<TextSegment> getEmbeddingStore() {
        return embeddingStore;
    }

    public JdbcTemplate getJdbcTemplate() {
        return jdbcTemplate;
    }

    public boolean isPgVectorAvailable() {
        return pgVectorAvailable;
    }

    public boolean isFtsAvailable() {
        return ftsAvailable;
    }

    public void disableFts() {
        this.ftsAvailable = false;
    }

    /**
     * 尝试为查询文本生成嵌入向量，带缓存和熔断降级。
     *
     * <p>当嵌入模型连续失败时，会在 {@link #EMBEDDING_FAILURE_BACKOFF} 时间内跳过向量检索。 返回 null 表示当前不可用，调用方应降级到其他策略。
     */
    public Embedding tryEmbedQuery(String normalizedQuery) {
        if (normalizedQuery == null || normalizedQuery.isBlank()) {
            return null;
        }
        Instant now = Instant.now();
        if (now.isBefore(embeddingDisabledUntil)) {
            return null;
        }

        String cacheKey = normalizedQuery.toLowerCase(Locale.ROOT);
        Embedding cached = queryEmbeddingCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }

        try {
            Embedding embedding = embeddingModel.embed(normalizedQuery).content();
            queryEmbeddingCache.put(cacheKey, embedding);
            return embedding;
        } catch (RuntimeException ex) {
            embeddingDisabledUntil = now.plus(EMBEDDING_FAILURE_BACKOFF);
            log.warn(
                    "Embedding model unavailable; vector retrieval is disabled until {}. Error: {}",
                    embeddingDisabledUntil,
                    ex.getMessage());
            return null;
        }
    }
}
