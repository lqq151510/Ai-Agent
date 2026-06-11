package com.agent.mvp.config;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.vertexai.VertexAiGeminiChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Configuration
@ConditionalOnProperty(name = "app.default-provider", havingValue = "VERTEXAI")
public class VertexAiConfig {

    @Value("${app.vertexai.project-id:}")
    private String projectId;

    @Value("${app.vertexai.location:us-central1}")
    private String location;

    @Value("${app.vertexai.model-name:gemini-2.5-pro}")
    private String modelName;

    @Bean
    public ChatLanguageModel vertexAiChatModel() {
        return VertexAiGeminiChatModel.builder()
                .project(projectId)
                .location(location)
                .modelName(modelName)
                .build();
    }
}
