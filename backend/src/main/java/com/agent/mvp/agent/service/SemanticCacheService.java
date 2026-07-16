package com.agent.mvp.agent.service;

import com.agent.mvp.config.AppProperties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.langchain4j.store.embedding.pgvector.PgVectorEmbeddingStore;
import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class SemanticCacheService {
    private static final Logger log = LoggerFactory.getLogger(SemanticCacheService.class);
    private static final Duration EMBEDDING_FAILURE_BACKOFF = Duration.ofMinutes(2);
    private static final double CACHE_HIT_MIN_SCORE = 0.95;

    private final EmbeddingModel embeddingModel;
    private final Cache<String, Embedding> promptEmbeddingCache;
    private EmbeddingStore<TextSegment> embeddingStore;
    private volatile Instant embeddingDisabledUntil = Instant.EPOCH;

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

    @Autowired
    public SemanticCacheService(AppProperties appProperties) {
        this(appProperties, buildEmbeddingModel(appProperties), null);
    }

    SemanticCacheService(
            AppProperties appProperties,
            EmbeddingModel embeddingModel,
            EmbeddingStore<TextSegment> embeddingStore) {
        this.embeddingModel = embeddingModel;
        this.embeddingStore = embeddingStore;
        this.promptEmbeddingCache =
                Caffeine.newBuilder()
                        .maximumSize(512)
                        .expireAfterWrite(Duration.ofMinutes(15))
                        .build();
    }

    @PostConstruct
    public void init() {
        if (embeddingStore != null) {
            return;
        }
        try {
            log.info(
                    "Initializing SemanticCacheService PgVectorEmbeddingStore with host: {}, port:"
                            + " {}",
                    pgHost,
                    pgPort);
            this.embeddingStore =
                    PgVectorEmbeddingStore.builder()
                            .host(pgHost)
                            .port(pgPort)
                            .database(pgDatabase)
                            .user(pgUsername)
                            .password(pgPassword)
                            .table("semantic_cache")
                            .dimension(384)
                            .build();
            log.info("SemanticCacheService PgVectorEmbeddingStore initialized successfully.");
        } catch (Exception ex) {
            log.warn(
                    "Failed to initialize PgVectorEmbeddingStore for Semantic Cache. Falling back"
                            + " to InMemoryEmbeddingStore. Error: {}",
                    ex.getMessage());
            this.embeddingStore = new InMemoryEmbeddingStore<>();
        }
    }

    /** 根据输入 prompt 查询是否有相似度极高的缓存回答 */
    public Optional<String> findCachedResponse(String prompt) {
        String normalizedPrompt = normalizePrompt(prompt);
        if (normalizedPrompt.isBlank()) {
            return Optional.empty();
        }
        try {
            Embedding queryEmbedding = tryEmbedPrompt(normalizedPrompt);
            if (queryEmbedding == null) {
                return Optional.empty();
            }
            EmbeddingSearchRequest request =
                    EmbeddingSearchRequest.builder()
                            .queryEmbedding(queryEmbedding)
                            .maxResults(1)
                            .minScore(CACHE_HIT_MIN_SCORE)
                            .build();
            List<EmbeddingMatch<TextSegment>> matches = embeddingStore.search(request).matches();
            if (matches != null && !matches.isEmpty()) {
                EmbeddingMatch<TextSegment> match = matches.get(0);
                String cachedResponse = match.embedded().metadata().getString("response");
                log.info(
                        "Semantic cache hit for prompt: {} with similarity: {}",
                        normalizedPrompt,
                        match.score());
                return Optional.ofNullable(cachedResponse);
            }
        } catch (Exception ex) {
            log.error("Failed to query semantic cache. Error: {}", ex.getMessage());
        }
        return Optional.empty();
    }

    /** 异步将新的问答对存入缓存 */
    @Async
    public void cacheResponseAsync(String prompt, String response) {
        String normalizedPrompt = normalizePrompt(prompt);
        if (normalizedPrompt.isBlank() || response == null || response.isBlank()) {
            return;
        }
        try {
            Embedding embedding = tryEmbedPrompt(normalizedPrompt);
            if (embedding == null) {
                return;
            }
            TextSegment segment =
                    TextSegment.from(normalizedPrompt, Metadata.from("response", response));
            embeddingStore.add(embedding, segment);
            log.info("Successfully cached new QA pair asynchronously");
        } catch (Exception ex) {
            log.error("Failed to cache QA pair. Error: {}", ex.getMessage());
        }
    }

    private static EmbeddingModel buildEmbeddingModel(AppProperties appProperties) {
        return dev.langchain4j.model.openai.OpenAiEmbeddingModel.builder()
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
                                        1_000, appProperties.getModelRuntime().getReadTimeoutMs())))
                .maxRetries(Math.max(0, appProperties.getModelRuntime().getIdempotentRetries()))
                .build();
    }

    private Embedding tryEmbedPrompt(String prompt) {
        String normalizedPrompt = normalizePrompt(prompt);
        if (normalizedPrompt.isBlank()) {
            return null;
        }

        Instant now = Instant.now();
        if (now.isBefore(embeddingDisabledUntil)) {
            return null;
        }

        String cacheKey = normalizedPrompt.toLowerCase(Locale.ROOT);
        Embedding cached = promptEmbeddingCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }

        try {
            Embedding embedding = embeddingModel.embed(normalizedPrompt).content();
            promptEmbeddingCache.put(cacheKey, embedding);
            return embedding;
        } catch (RuntimeException ex) {
            embeddingDisabledUntil = now.plus(EMBEDDING_FAILURE_BACKOFF);
            log.warn(
                    "Embedding model unavailable; semantic cache is disabled until {}. Error: {}",
                    embeddingDisabledUntil,
                    ex.getMessage());
            return null;
        }
    }

    private String normalizePrompt(String prompt) {
        if (prompt == null) {
            return "";
        }
        return prompt.replaceAll("\\s+", " ").trim();
    }
}
