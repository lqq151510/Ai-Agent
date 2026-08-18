package com.agent.mvp.agent.service;

import com.agent.mvp.agent.search.EmbeddingStoreProvider;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class SemanticCacheService {
    private static final Logger log = LoggerFactory.getLogger(SemanticCacheService.class);
    private static final double CACHE_HIT_MIN_SCORE = 0.95;

    private final EmbeddingStoreProvider storeProvider;
    private EmbeddingStore<TextSegment> embeddingStore;

    @Autowired
    public SemanticCacheService(EmbeddingStoreProvider storeProvider) {
        this(storeProvider, null);
    }

    SemanticCacheService(
            EmbeddingStoreProvider storeProvider, EmbeddingStore<TextSegment> embeddingStore) {
        this.storeProvider = storeProvider;
        this.embeddingStore = embeddingStore;
    }

    @PostConstruct
    public void init() {
        if (embeddingStore != null) {
            return;
        }
        this.embeddingStore = storeProvider.createEmbeddingStore("semantic_cache", 384);
    }

    /** 根据用户 ID 和输入 prompt 查询是否有相似度极高的缓存回答（用户级隔离） */
    public Optional<String> findCachedResponse(UUID userId, String prompt) {
        String normalizedPrompt = normalizePrompt(prompt);
        if (normalizedPrompt.isBlank() || userId == null) {
            return Optional.empty();
        }
        try {
            Embedding queryEmbedding = tryEmbedPrompt(normalizedPrompt);
            if (queryEmbedding == null) {
                return Optional.empty();
            }
            dev.langchain4j.store.embedding.filter.Filter userFilter =
                    dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey(
                                    "userId")
                            .isEqualTo(userId.toString());
            EmbeddingSearchRequest request =
                    EmbeddingSearchRequest.builder()
                            .queryEmbedding(queryEmbedding)
                            .filter(userFilter)
                            .maxResults(1)
                            .minScore(CACHE_HIT_MIN_SCORE)
                            .build();
            List<EmbeddingMatch<TextSegment>> matches = embeddingStore.search(request).matches();
            if (matches != null && !matches.isEmpty()) {
                EmbeddingMatch<TextSegment> match = matches.get(0);
                String cachedResponse = match.embedded().metadata().getString("response");
                log.info(
                        "Semantic cache hit for user: {} prompt: {} with similarity: {}",
                        userId,
                        normalizedPrompt,
                        match.score());
                return Optional.ofNullable(cachedResponse);
            }
        } catch (Exception ex) {
            log.error("Failed to query semantic cache. Error: {}", ex.getMessage());
        }
        return Optional.empty();
    }

    /** 兼容旧接口重载（仅当无用户上下文时） */
    public Optional<String> findCachedResponse(String prompt) {
        return findCachedResponse((UUID) null, prompt);
    }

    /** 异步将带用户隔离的新问答对存入缓存 */
    @Async
    public void cacheResponseAsync(UUID userId, String prompt, String response) {
        String normalizedPrompt = normalizePrompt(prompt);
        if (normalizedPrompt.isBlank()
                || response == null
                || response.isBlank()
                || userId == null) {
            return;
        }
        try {
            Embedding embedding = tryEmbedPrompt(normalizedPrompt);
            if (embedding == null) {
                return;
            }
            Metadata metadata =
                    Metadata.from(
                            java.util.Map.of("response", response, "userId", userId.toString()));
            TextSegment segment = TextSegment.from(normalizedPrompt, metadata);
            embeddingStore.add(embedding, segment);
            log.info("Successfully cached new QA pair asynchronously for user: {}", userId);
        } catch (Exception ex) {
            log.error("Failed to cache QA pair. Error: {}", ex.getMessage());
        }
    }

    /** 兼容旧接口重载 */
    @Async
    public void cacheResponseAsync(String prompt, String response) {
        cacheResponseAsync(null, prompt, response);
    }

    private Embedding tryEmbedPrompt(String prompt) {
        return storeProvider.tryEmbedQuery(normalizePrompt(prompt));
    }

    private String normalizePrompt(String prompt) {
        if (prompt == null) {
            return "";
        }
        return prompt.replaceAll("\\s+", " ").trim();
    }
}
