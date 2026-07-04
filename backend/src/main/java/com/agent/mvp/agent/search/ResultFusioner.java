package com.agent.mvp.agent.search;

import java.util.List;

/**
 * 结果融合器抽象，将多个策略返回的 {@link SearchResult} 列表合并为统一排序的结果。
 *
 * <p>不同算法（RRF、加权融合、学习排序等）可以独立替换，与搜索策略解耦。
 */
public interface ResultFusioner {

    /**
     * 融合多组搜索结果。
     *
     * @param groupedResults 每个策略对应一组按相关性排序的结果列表
     * @param maxResults 最终返回的最大结果数
     * @return 融合并排序后的文本列表
     */
    List<String> fuse(List<List<SearchResult>> groupedResults, int maxResults);

    /** 融合算法名称，用于指标和日志。 */
    String name();
}
