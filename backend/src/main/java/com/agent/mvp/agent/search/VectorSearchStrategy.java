package com.agent.mvp.agent.search;

import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeMaxResults;
import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeQuery;

import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 向量语义搜索策略，基于嵌入模型的相似度检索。
 *
 * <p>对自然语言语义查询有稳定的中高置信度；对精确符号查询的置信度低于 FTS。
 * 当嵌入模型不可用（熔断期间）时返回空结果，由编排器降级到其他策略。
 */
@Component
public class VectorSearchStrategy implements SearchStrategy {

    private static final Logger log = LoggerFactory.getLogger(VectorSearchStrategy.class);
    private static final String NAME = "VECTOR";

    private final EmbeddingStoreProvider storeProvider;
    private final SearchConfig config;

    public VectorSearchStrategy(EmbeddingStoreProvider storeProvider, SearchConfig config) {
        this.storeProvider = storeProvider;
        this.config = config;
    }

    @Override
    public List<String> search(String query, int maxResults) {
        List<String> results = new ArrayList<>();
        String normalizedQuery = normalizeQuery(query);
        int safeMaxResults = normalizeMaxResults(maxResults);
        if (normalizedQuery.isBlank()) {
            return results;
        }

        EmbeddingStore<TextSegment> store = storeProvider.getEmbeddingStore();
        if (store == null) {
            return results;
        }

        try {
            Embedding queryEmbedding = storeProvider.tryEmbedQuery(normalizedQuery);
            if (queryEmbedding == null) {
                return results;
            }
            EmbeddingSearchRequest request = EmbeddingSearchRequest.builder()
                    .queryEmbedding(queryEmbedding)
                    .maxResults(safeMaxResults)
                    .build();
            List<EmbeddingMatch<TextSegment>> matches = store.search(request).matches();
            for (EmbeddingMatch<TextSegment> match : matches) {
                results.add(match.embedded().text());
            }
        } catch (Exception ex) {
            log.error(
                    "Failed to search code context from vector store. Error: {}",
                    ex.getMessage());
        }
        return results;
    }

    @Override
    public boolean isAvailable() {
        return config.getStrategies().getVector().isEnabled()
                && storeProvider.getEmbeddingStore() != null;
    }

    @Override
    public double getConfidence(String query) {
        if (query == null || query.isBlank()) {
            return 0.0;
        }
        return 0.7 * Math.max(0.0, config.getStrategies().getVector().getWeight());
    }

    @Override
    public String name() {
        return NAME;
    }
}
