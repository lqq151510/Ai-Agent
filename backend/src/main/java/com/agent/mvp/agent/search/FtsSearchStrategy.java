package com.agent.mvp.agent.search;

import static com.agent.mvp.agent.search.SearchQueryUtils.looksLikeExactLookup;
import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeMaxResults;
import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeQuery;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 全文搜索（FTS）策略，基于 PostgreSQL 的 tsvector 全文索引和 ILIKE 模糊匹配。
 *
 * <p>对包含文件路径、类名、方法符号等精确标识符的查询有较高置信度；对自然语言语义查询置信度较低。
 */
@Component
public class FtsSearchStrategy implements SearchStrategy {

    private static final Logger log = LoggerFactory.getLogger(FtsSearchStrategy.class);
    private static final String NAME = "FTS";

    private static final String SEARCH_SQL =
            "SELECT text FROM engineering_memory WHERE to_tsvector('simple', COALESCE(text, ''))"
                    + " @@ plainto_tsquery('simple', ?)    OR text ILIKE ? LIMIT ?";

    private final EmbeddingStoreProvider storeProvider;
    private final SearchConfig config;

    public FtsSearchStrategy(EmbeddingStoreProvider storeProvider, SearchConfig config) {
        this.storeProvider = storeProvider;
        this.config = config;
    }

    @Override
    public List<String> search(String query, int maxResults) {
        if (!isAvailable()) {
            return List.of();
        }
        String normalizedQuery = normalizeQuery(query);
        int safeMaxResults = normalizeMaxResults(maxResults);
        if (normalizedQuery.isBlank()) {
            return List.of();
        }

        List<String> results = new ArrayList<>();
        try {
            String likePattern = "%" + normalizedQuery + "%";
            results =
                    storeProvider
                            .getJdbcTemplate()
                            .query(
                                    SEARCH_SQL,
                                    (rs, rowNum) -> rs.getString("text"),
                                    normalizedQuery,
                                    likePattern,
                                    safeMaxResults);
            log.info(
                    "FTS search returned {} results for query: {}",
                    results.size(),
                    normalizedQuery);
        } catch (Exception e) {
            storeProvider.disableFts();
            log.warn("Failed to perform FTS search. Falling back. Error: {}", e.getMessage());
        }
        return results;
    }

    @Override
    public boolean isAvailable() {
        return config.getStrategies().getFts().isEnabled() && storeProvider.isFtsAvailable();
    }

    @Override
    public double getConfidence(String query) {
        if (query == null || query.isBlank()) {
            return 0.0;
        }
        double baseConfidence = looksLikeExactLookup(query) ? 0.9 : 0.3;
        return baseConfidence * Math.max(0.0, config.getStrategies().getFts().getWeight());
    }

    @Override
    public String name() {
        return NAME;
    }
}
