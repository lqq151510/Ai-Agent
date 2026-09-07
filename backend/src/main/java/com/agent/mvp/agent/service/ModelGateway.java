package com.agent.mvp.agent.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.provider.ModelProvider;
import com.agent.mvp.common.exception.BadRequestException;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.stereotype.Service;

@Service
public class ModelGateway {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(ModelGateway.class);

    private final Map<ModelProviderType, ModelProvider> providers =
            new EnumMap<>(ModelProviderType.class);

    public ModelGateway(List<ModelProvider> providerList) {
        for (ModelProvider provider : providerList) {
            providers.put(provider.type(), provider);
        }
    }

    public ModelChatResponse chat(ModelProviderType providerType, ModelChatRequest request) {
        try {
            return provider(providerType).chat(request);
        } catch (Exception ex) {
            // 当主模型服务调用失败时，尝试主备自动容灾降级
            for (Map.Entry<ModelProviderType, ModelProvider> entry : providers.entrySet()) {
                if (entry.getKey() != providerType) {
                    try {
                        log.warn(
                                "Primary model provider {} failed: {}. Attempting fallback to {}",
                                providerType,
                                ex.getMessage(),
                                entry.getKey());
                        return entry.getValue().chat(request);
                    } catch (Exception fallbackEx) {
                        log.warn(
                                "Fallback provider {} also failed: {}",
                                entry.getKey(),
                                fallbackEx.getMessage());
                    }
                }
            }
            if (ex instanceof RuntimeException re) {
                throw re;
            }
            throw new RuntimeException("Model chat failed", ex);
        }
    }

    public ModelChatResponse stream(
            ModelProviderType providerType,
            ModelChatRequest request,
            Consumer<String> chunkConsumer) {
        return provider(providerType).stream(request, chunkConsumer);
    }

    private ModelProvider provider(ModelProviderType providerType) {
        ModelProvider provider = providers.get(providerType);
        if (provider == null) {
            throw new BadRequestException("Provider not supported: " + providerType);
        }
        return provider;
    }
}
