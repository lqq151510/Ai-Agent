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

    private final Map<ModelProviderType, ModelProvider> providers =
            new EnumMap<>(ModelProviderType.class);

    public ModelGateway(List<ModelProvider> providerList) {
        for (ModelProvider provider : providerList) {
            providers.put(provider.type(), provider);
        }
    }

    public ModelChatResponse chat(ModelProviderType providerType, ModelChatRequest request) {
        return provider(providerType).chat(request);
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
