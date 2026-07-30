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
     * 异步写入语义缓存。当 response 为空时直接跳过；任何异常都被吞噬并仅记录警告日志。
     */
    public void writeAsync(String prompt, String response) {
        if (response == null || response.isBlank()) {
            return;
        }
        try {
            semanticCacheService.cacheResponseAsync(prompt, response);
        } catch (Exception ex) {
            log.warn("Semantic cache write failed, ignoring", ex);
        }
    }
}
