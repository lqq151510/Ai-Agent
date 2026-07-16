package com.agent.mvp.agent.search;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Reciprocal Rank Fusion 融合器实现。
 *
 * <p>对每个策略返回的命中项按排名计算得分 {@code 1/(k + rank)}，跨策略累加后按总分降序排序。 参数 {@code k} 用于抑制高排名项的得分过度主导，默认 60。
 */
@Component
public class RRFusioner implements ResultFusioner {

    private static final Logger log = LoggerFactory.getLogger(RRFusioner.class);
    private static final String NAME = "RRF";

    private final int k;

    public RRFusioner(@Value("${app.search.fusion.rrf-k:60}") int k) {
        if (k <= 0) {
            throw new IllegalArgumentException("RRF k must be positive, got: " + k);
        }
        this.k = k;
    }

    @Override
    public List<String> fuse(List<List<SearchResult>> groupedResults, int maxResults) {
        if (groupedResults == null || groupedResults.isEmpty()) {
            return List.of();
        }
        Map<String, Double> rrfScores = new HashMap<>();

        for (List<SearchResult> results : groupedResults) {
            if (results == null || results.isEmpty()) {
                continue;
            }
            for (SearchResult result : results) {
                if (result == null || result.content() == null) {
                    continue;
                }
                double score = 1.0 / (k + Math.max(1, result.rank()));
                rrfScores.merge(result.content(), score, Double::sum);
            }
        }

        List<Map.Entry<String, Double>> sorted = new ArrayList<>(rrfScores.entrySet());
        sorted.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

        List<String> finalResults = new ArrayList<>();
        int limit = Math.min(Math.max(0, maxResults), sorted.size());
        for (int i = 0; i < limit; i++) {
            finalResults.add(sorted.get(i).getKey());
        }

        log.debug(
                "RRF fused {} results from {} groups, returning top {}",
                rrfScores.size(),
                groupedResults.size(),
                finalResults.size());
        return finalResults;
    }

    @Override
    public String name() {
        return NAME;
    }
}
