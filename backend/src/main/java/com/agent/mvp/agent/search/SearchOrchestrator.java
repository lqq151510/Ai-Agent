package com.agent.mvp.agent.search;

import static com.agent.mvp.agent.search.SearchQueryUtils.looksLikeExactLookup;
import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeMaxResults;
import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeQuery;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 搜索策略编排器，根据 {@link SearchConfig} 选择和执行搜索策略，并通过 {@link ResultFusioner} 融合结果。
 *
 * <p>支持四种编排模式：
 * <ul>
 *   <li>{@link SearchMode#FTS_ONLY} - 仅 FTS，适合精确符号查询
 *   <li>{@link SearchMode#VECTOR_ONLY} - 仅向量，适合纯语义查询
 *   <li>{@link SearchMode#HYBRID} - 固定执行所有可用策略并融合
 *   <li>{@link SearchMode#ADAPTIVE} - 基于置信度动态选择和组合策略
 * </ul>
 */
@Service
public class SearchOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(SearchOrchestrator.class);

    private final List<SearchStrategy> strategies;
    private final ResultFusioner fusioner;
    private final SearchConfig config;

    public SearchOrchestrator(
            List<SearchStrategy> strategies, ResultFusioner fusioner, SearchConfig config) {
        this.strategies = strategies != null ? strategies : List.of();
        this.fusioner = fusioner;
        this.config = config;
    }

    /**
     * 执行搜索编排。
     *
     * @param query 已由调用方规范化的查询文本
     * @param maxResults 期望返回的最大结果数
     * @return 排序后的搜索结果列表
     */
    public List<String> search(String query, int maxResults) {
        String normalizedQuery = normalizeQuery(query);
        int safeMaxResults = normalizeMaxResults(maxResults);
        if (normalizedQuery.isBlank()) {
            return List.of();
        }

        SearchMode mode = resolveMode(normalizedQuery);
        log.debug("Searching with mode={} query='{}' maxResults={}", mode, normalizedQuery, safeMaxResults);

        return switch (mode) {
            case FTS_ONLY -> executeSingleStrategy(normalizedQuery, safeMaxResults, "FTS");
            case VECTOR_ONLY -> executeSingleStrategy(normalizedQuery, safeMaxResults, "VECTOR");
            case HYBRID -> executeHybridSearch(normalizedQuery, safeMaxResults);
            case ADAPTIVE -> executeAdaptiveSearch(normalizedQuery, safeMaxResults);
        };
    }

    private List<String> executeAdaptiveSearch(String query, int maxResults) {
        List<SearchStrategy> selected = selectStrategiesByConfidence(query);
        if (selected.isEmpty()) {
            return executeHybridSearch(query, maxResults);
        }

        List<String> results =
                selected.size() == 1
                        ? selected.get(0).search(query, maxResults)
                        : executeFusionSearch(query, maxResults, selected);
        if (!results.isEmpty()) {
            return results;
        }

        List<SearchStrategy> fallbackStrategies = getAvailableStrategies().stream()
                .filter(strategy -> !selected.contains(strategy))
                .collect(Collectors.toList());
        if (fallbackStrategies.isEmpty()) {
            return results;
        }
        if (fallbackStrategies.size() == 1) {
            return fallbackStrategies.get(0).search(query, maxResults);
        }
        return executeFusionSearch(query, maxResults, fallbackStrategies);
    }

    /**
     * 混合模式：执行所有可用策略并融合结果。
     */
    private List<String> executeHybridSearch(String query, int maxResults) {
        List<SearchStrategy> available = getAvailableStrategies();
        if (available.isEmpty()) {
            return List.of();
        }
        if (available.size() == 1) {
            return available.get(0).search(query, maxResults);
        }
        return executeFusionSearch(query, maxResults, available);
    }

    private List<String> executeSingleStrategy(String query, int maxResults, String strategyName) {
        return strategies.stream()
                .filter(s -> strategyName.equals(s.name()))
                .filter(SearchStrategy::isAvailable)
                .findFirst()
                .map(s -> s.search(query, maxResults))
                .orElse(List.of());
    }

    private List<String> executeFusionSearch(
            String query, int maxResults, List<SearchStrategy> selected) {
        List<List<SearchResult>> groupedResults = new ArrayList<>();
        for (SearchStrategy strategy : selected) {
            List<String> raw = strategy.search(query, maxResults * 2);
            if (raw.isEmpty()) {
                continue;
            }
            List<SearchResult> ranked = new ArrayList<>();
            for (int i = 0; i < raw.size(); i++) {
                ranked.add(SearchResult.of(raw.get(i), i + 1, strategy.name()));
            }
            groupedResults.add(ranked);
        }
        if (groupedResults.isEmpty()) {
            return List.of();
        }
        if (groupedResults.size() == 1) {
            return truncate(groupedResults.get(0).stream()
                    .map(SearchResult::content)
                    .collect(Collectors.toList()), maxResults);
        }
        return fusioner.fuse(groupedResults, maxResults);
    }

    private List<SearchStrategy> selectStrategiesByConfidence(String query) {
        double threshold = config.getConfidenceThreshold();
        int maxStrategies = Math.max(1, config.getMaxStrategies());
        return strategies.stream()
                .filter(SearchStrategy::isAvailable)
                .filter(s -> s.getConfidence(query) >= threshold)
                .sorted(Comparator.comparingDouble(
                        (SearchStrategy s) -> s.getConfidence(query)).reversed())
                .limit(maxStrategies)
                .collect(Collectors.toList());
    }

    private List<SearchStrategy> getAvailableStrategies() {
        return strategies.stream()
                .filter(SearchStrategy::isAvailable)
                .collect(Collectors.toList());
    }

    /**
     * 解析实际使用的搜索模式。
     *
     * <p>当配置为 ADAPTIVE 但只有一个可用策略时，直接退化为单策略执行，避免不必要的融合开销。
     */
    private SearchMode resolveMode(String query) {
        SearchMode configured = config.getDefaultMode();
        if (configured == SearchMode.ADAPTIVE && looksLikeExactLookup(query)) {
            long ftsCount = strategies.stream()
                    .filter(s -> "FTS".equals(s.name()))
                    .filter(SearchStrategy::isAvailable)
                    .count();
            if (ftsCount > 0) {
                return SearchMode.HYBRID;
            }
        }
        return configured;
    }

    private List<String> truncate(List<String> results, int maxResults) {
        if (results.size() <= maxResults) {
            return results;
        }
        return new ArrayList<>(results.subList(0, maxResults));
    }
}
