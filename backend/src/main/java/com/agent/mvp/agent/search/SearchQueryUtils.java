package com.agent.mvp.agent.search;

/** 搜索查询的共享工具方法，提取自原 RAGMemoryService。 */
public final class SearchQueryUtils {

    public static final int MAX_RETRIEVAL_RESULTS = 20;
    public static final int MAX_VECTOR_CANDIDATES = 50;

    private SearchQueryUtils() {}

    /** 规范化查询文本：合并多余空白并去除首尾空白。 */
    public static String normalizeQuery(String queryText) {
        if (queryText == null) {
            return "";
        }
        return queryText.replaceAll("\\s+", " ").trim();
    }

    /** 将 maxResults 限制在合理范围内 [1, MAX_RETRIEVAL_RESULTS]。 */
    public static int normalizeMaxResults(int maxResults) {
        if (maxResults <= 0) {
            return 1;
        }
        return Math.min(maxResults, MAX_RETRIEVAL_RESULTS);
    }

    /**
     * 判断查询是否像精确符号查找（文件路径、类名、方法引用等）。
     *
     * <p>这类查询适合 FTS 而非语义向量检索。
     */
    public static boolean looksLikeExactLookup(String queryText) {
        if (queryText == null || queryText.isBlank()) {
            return false;
        }
        return queryText.contains("/")
                || queryText.contains(".")
                || queryText.contains("#")
                || queryText.contains("::")
                || queryText.matches(
                        ".*\\b[A-Za-z]+(Service|Controller|Repository|Config|Entity|Test|DTO)\\b.*");
    }
}
