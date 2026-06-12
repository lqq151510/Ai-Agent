package com.agent.mvp.agent.provider;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import java.util.function.Consumer;

public interface ModelProvider {

    ModelProviderType type();

    ModelChatResponse chat(ModelChatRequest request);

    default ModelChatResponse stream(ModelChatRequest request, Consumer<String> chunkConsumer) {
        ModelChatResponse response = chat(request);
        if (response.content() != null && !response.content().isBlank()) {
            chunkConsumer.accept(response.content());
        }
        return response;
    }
}
