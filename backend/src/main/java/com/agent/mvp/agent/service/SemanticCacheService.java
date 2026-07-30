package com.agent.mvp.agent.service;

import com.agent.mvp.agent.search.EmbeddingStoreProvider;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Optional;
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
