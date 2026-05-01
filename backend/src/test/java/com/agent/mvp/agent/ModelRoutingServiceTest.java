package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.service.ModelRoutingService;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.entity.ConversationSession;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ModelRoutingServiceTest {

    @Test
    void shouldUseRequestProviderAndModelFirst() {
        AppProperties appProperties = new AppProperties();
        appProperties.setDefaultProvider(ModelProviderType.OPENAI);
        appProperties.setDefaultOpenaiModel("gpt-4.1-mini");

        ModelRoutingService service = new ModelRoutingService(appProperties);
        ConversationSession session = new ConversationSession();
        session.setProvider(ModelProviderType.OPENAI);
        session.setModel("gpt-4o");

        ResolvedModelConfig cfg = service.resolve(ModelProviderType.OPENAI, "gpt-4o-mini", session);

        assertEquals(ModelProviderType.OPENAI, cfg.provider());
        assertEquals("gpt-4o-mini", cfg.model());
    }

    @Test
    void shouldFallbackToSessionThenDefault() {
        AppProperties appProperties = new AppProperties();
        appProperties.setDefaultProvider(ModelProviderType.OPENAI);
        appProperties.setDefaultOpenaiModel("gpt-4.1-mini");

        ModelRoutingService service = new ModelRoutingService(appProperties);
        ConversationSession session = new ConversationSession();
        session.setProvider(ModelProviderType.OPENAI);
        session.setModel("gpt-4o");

        ResolvedModelConfig cfg = service.resolve(null, null, session);

        assertEquals(ModelProviderType.OPENAI, cfg.provider());
        assertEquals("gpt-4o", cfg.model());
    }
}
