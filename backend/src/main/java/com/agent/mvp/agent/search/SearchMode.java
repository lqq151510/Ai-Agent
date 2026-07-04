package com.agent.mvp.agent.search;

/**
 * 搜索编排模式，由 {@link SearchConfig#getDefaultMode()} 决定编排器采用哪种策略选择方式。
 *
 * <ul>
 *   <li>{@link #FTS_ONLY} - 仅使用全文搜索，适合精确符号查询场景
 *   <li>{@link #VECTOR_ONLY} - 仅使用向量搜索，适合纯语义查询场景
 *   <li>{@link #HYBRID} - 固定执行所有可用策略并融合结果
 *   <li>{@link #ADAPTIVE} - 基于各策略的置信度动态选择和组合
 * </ul>
 */
public enum SearchMode {
    FTS_ONLY,
    VECTOR_ONLY,
    HYBRID,
    ADAPTIVE
}
