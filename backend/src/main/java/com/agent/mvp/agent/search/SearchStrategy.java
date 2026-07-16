package com.agent.mvp.agent.search;

import java.util.List;

/**
 * 统一的搜索策略抽象，将搜索行为的执行、可用性判断和置信度评估分离。
 *
 * <p>不同实现（FTS、向量、BM25 等）可以独立替换或组合，编排器根据 {@link #getConfidence(String)} 和 {@link #isAvailable()}
 * 动态选择策略。
 */
public interface SearchStrategy {

    /** 执行搜索并返回命中的文本片段。 */
    List<String> search(String query, int maxResults);

    /** 当前策略是否可用（依赖的服务/索引是否就绪）。 */
    boolean isAvailable();

    /**
     * 对给定查询返回 0.0-1.0 的置信度，编排器据此排序和筛选策略。
     *
     * <p>语义查询适合向量搜索，精确符号查询适合 FTS 搜索。
     */
    double getConfidence(String query);

    /** 策略名称，用于指标和日志。 */
    String name();
}
