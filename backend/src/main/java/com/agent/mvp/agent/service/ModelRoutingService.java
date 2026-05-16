package com.agent.mvp.agent.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.entity.ConversationSession;
import org.springframework.stereotype.Service;

@Service
public class ModelRoutingService {

    private final AppProperties appProperties;

    public ModelRoutingService(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    public ResolvedModelConfig resolve(ModelProviderType requestProvider,
                                       String requestModel,
                                       ConversationSession session) {
        ModelProviderType provider = requestProvider != null ? requestProvider
                : session != null && session.getProvider() != null ? session.getProvider()
                : appProperties.getDefaultProvider();

        String model = requestModel;
        if (model == null || model.isBlank()) {
            if (session != null && session.getModel() != null && !session.getModel().isBlank()) {
                model = session.getModel();
            } else {
                model = appProperties.getDefaultModel(provider);
            }
        }

        return new ResolvedModelConfig(provider, model);
    }
}
