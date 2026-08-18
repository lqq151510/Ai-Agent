package com.agent.mvp.agent.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 抽取自 AgentService，统一处理语义缓存的异步写入与异常吞噬，保证缓存失败不影响主流程。
 */
@Component
public class SemanticCacheWriter {
    private static final Logger log = LoggerFactory.getLogger(SemanticCacheWriter.class);

    private final SemanticCacheService semanticCacheService;

    public SemanticCacheWriter(SemanticCacheService semanticCacheService) {
        this.semanticCacheService = semanticCacheService;
    }

    /**
     * 异步写入语义缓存（带用户隔离）。当 response 为空时直接跳过；任何异常都被吞噬并仅记录警告日志。
     */
    public void writeAsync(java.util.UUID userId, String prompt, String response) {
        if (response == null || response.isBlank() || userId == null) {
            return;
        }
        try {
            semanticCacheService.cacheResponseAsync(userId, prompt, response);
        } catch (Exception ex) {
            log.warn("Semantic cache write failed for user {}, ignoring", userId, ex);
        }
    }

    /**
     * 兼容旧版写入方法
     */
    public void writeAsync(String prompt, String response) {
        writeAsync(null, prompt, response);
    }
}
