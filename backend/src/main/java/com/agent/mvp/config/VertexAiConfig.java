package com.agent.mvp.config;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.vertexai.VertexAiGeminiChatModel;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "app.default-provider", havingValue = "VERTEXAI")
public class VertexAiConfig {

    private final AppProperties appProperties;

    public VertexAiConfig(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    @Bean
    public ChatLanguageModel vertexAiChatModel() {
        AppProperties.VertexAi vertexAi = appProperties.getVertexAi();
        return VertexAiGeminiChatModel.builder()
                .project(vertexAi.getProjectId())
                .location(vertexAi.getLocation())
                .modelName(vertexAi.getModelName())
                .build();
    }
}
