package com.agent.mvp.agent.service;

import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.service.ModelSourceService;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 抽取自 AgentService，统一处理 ModelSource 的解析逻辑：当 modelSourceId 非空时，校验归属并读取 baseUrl/apiKey；为空时回退到调用方传入的
 * customApiKey。
 */
@Component
public class ModelSourceResolver {
    private final ModelSourceService modelSourceService;

    public ModelSourceResolver(ModelSourceService modelSourceService) {
        this.modelSourceService = modelSourceService;
    }

    /** 解析后端要使用的 baseUrl 与 apiKey。 */
    public record ResolvedEndpoint(String baseUrl, String apiKey) {}

    /**
     * 解析 ModelSource。当 modelSourceId 为 null 时返回 (null, customApiKey)；否则读取 source 的 baseUrl，并在
     * source.apiKey 非空时覆盖 customApiKey。
     */
    public ResolvedEndpoint resolve(UUID userId, UUID modelSourceId, String customApiKey) {
        if (modelSourceId == null) {
            return new ResolvedEndpoint(null, customApiKey);
        }
        ModelSource source = modelSourceService.requireOwnedSource(userId, modelSourceId);
        String apiKey = customApiKey;
        if (source.getApiKey() != null && !source.getApiKey().isBlank()) {
            apiKey = source.getApiKey();
        }
        return new ResolvedEndpoint(source.getBaseUrl(), apiKey);
    }
}
