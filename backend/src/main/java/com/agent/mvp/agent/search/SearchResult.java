package com.agent.mvp.agent.search;

/** 带排名和来源策略的搜索命中项，用于结果融合器聚合。 */
public record SearchResult(String content, int rank, String strategyName) {

    public static SearchResult of(String content, int rank, String strategyName) {
        return new SearchResult(content, rank, strategyName);
    }
}
