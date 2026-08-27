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
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
        this.embeddingStore = createEmbeddingStore("engineering_memory", 384, true);
        this.pgVectorAvailable = embeddingStore instanceof PgVectorEmbeddingStore;
        this.ftsAvailable = initializeFtsIndex();
    }

    /**
     * 创建一个新的 EmbeddingStore（独立的 PgVector 表 + InMemory 回退）。
     *
     * <p>复用本 Provider 的 PG 连接配置，按 {@code tableName} 和 {@code dimension} 建立独立的向量存储； 创建失败时回退到 {@link
     * InMemoryEmbeddingStore}。
     */
    public EmbeddingStore<TextSegment> createEmbeddingStore(String tableName, int dimension) {
        return createEmbeddingStore(tableName, dimension, false);
    }

    EmbeddingStore<TextSegment> createEmbeddingStore(
            String tableName, int dimension, boolean persistLocalFallback) {
        AppProperties.PgVector pgVector = appProperties.getPgVector();
        if (!pgVector.isEnabled()) {
            log.info(
                    "PgVector is disabled; using InMemoryEmbeddingStore for table '{}'.",
                    tableName);
            return createLocalFallback(tableName, persistLocalFallback);
        }

        try {
            log.info(
                    "Initializing PgVectorEmbeddingStore for table '{}' with host: {}, port: {}",
                    tableName,
                    pgVector.getHost(),
                    pgVector.getPort());
            EmbeddingStore<TextSegment> store =
                    PgVectorEmbeddingStore.builder()
                            .host(pgVector.getHost())
                            .port(pgVector.getPort())
                            .database(pgVector.getDatabase())
                            .user(pgVector.getUsername())
                            .password(pgVector.getPassword())
                            .table(tableName)
                            .dimension(dimension)
                            .build();
            log.info("PgVectorEmbeddingStore for table '{}' initialized successfully.", tableName);
            return store;
        } catch (Exception ex) {
            log.warn(
                    "Failed to initialize PgVectorEmbeddingStore for table '{}'. Falling back to"
                            + " InMemoryEmbeddingStore. Error: {}",
                    tableName,
                    ex.getMessage());
            return createLocalFallback(tableName, persistLocalFallback);
        }
    }

    private EmbeddingStore<TextSegment> createLocalFallback(
            String tableName, boolean persistLocalFallback) {
        AppProperties.LocalVectorStore localVectorStore = appProperties.getLocalVectorStore();
        if (!persistLocalFallback || !localVectorStore.isEnabled()) {
            return new InMemoryEmbeddingStore<>();
        }
        if (localVectorStore.getDirectory() == null || localVectorStore.getDirectory().isBlank()) {
            log.warn(
                    "Desktop vector persistence is enabled but no directory is configured; using an in-memory index for '{}'.",
                    tableName);
            return new InMemoryEmbeddingStore<>();
        }
        if (!tableName.matches("[a-z0-9_]+")) {
            log.warn(
                    "Desktop vector persistence rejects unsafe index name '{}'; using an in-memory index.",
                    tableName);
            return new InMemoryEmbeddingStore<>();
        }

        try {
            Path snapshot = Path.of(localVectorStore.getDirectory())
                    .toAbsolutePath()
                    .normalize()
                    .resolve(tableName + ".json");
            log.info("Using persistent desktop vector index at {}", snapshot);
            return new PersistentInMemoryEmbeddingStore(snapshot);
        } catch (InvalidPathException ex) {
            log.warn(
                    "Desktop vector persistence directory is invalid; using an in-memory index for '{}'. Error: {}",
                    tableName,
                    ex.getMessage());
            return new InMemoryEmbeddingStore<>();
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
                            + "(to_tsvector('simple', COALESCE(text, '')))");
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
