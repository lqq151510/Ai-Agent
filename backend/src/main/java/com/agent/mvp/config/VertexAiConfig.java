package com.agent.mvp.config;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.vertexai.VertexAiGeminiChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class VertexAiConfig {

    @Value("${app.vertexai.project-id:project-8d97aef2-7684-4a10-858}")
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
