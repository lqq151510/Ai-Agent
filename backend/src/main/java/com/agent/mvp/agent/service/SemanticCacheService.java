package com.agent.mvp.agent.service;

import com.agent.mvp.config.AppProperties;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.langchain4j.store.embedding.pgvector.PgVectorEmbeddingStore;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class SemanticCacheService {
    private static final Logger log = LoggerFactory.getLogger(SemanticCacheService.class);

    private final AppProperties appProperties;
    private final EmbeddingModel embeddingModel;
    private EmbeddingStore<TextSegment> embeddingStore;

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

    public SemanticCacheService(AppProperties appProperties) {
        this.appProperties = appProperties;
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
                        .build();
    }

    @PostConstruct
    public void init() {
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
                    "Failed to initialize PgVectorEmbeddingStore for Semantic Cache. Falling back to"
                            + " InMemoryEmbeddingStore. Error: {}",
                    ex.getMessage());
            this.embeddingStore = new InMemoryEmbeddingStore<>();
        }
    }

    /** 根据输入 prompt 查询是否有相似度极高的缓存回答 */
    public Optional<String> findCachedResponse(String prompt) {
        try {
            Embedding queryEmbedding = embeddingModel.embed(prompt).content();
            List<EmbeddingMatch<TextSegment>> matches =
                    embeddingStore.findRelevant(queryEmbedding, 1, 0.95);
            if (matches != null && !matches.isEmpty()) {
                EmbeddingMatch<TextSegment> match = matches.get(0);
                String cachedResponse = match.embedded().metadata().getString("response");
                log.info(
                        "Semantic cache hit for prompt: {} with similarity: {}",
                        prompt,
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
        try {
            TextSegment segment = TextSegment.from(prompt, Metadata.from("response", response));
            Embedding embedding = embeddingModel.embed(segment).content();
            embeddingStore.add(embedding, segment);
            log.info("Successfully cached new QA pair asynchronously");
        } catch (Exception ex) {
            log.error("Failed to cache QA pair. Error: {}", ex.getMessage());
        }
    }
}
