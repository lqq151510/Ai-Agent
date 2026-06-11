package com.agent.mvp.config;

import com.agent.mvp.common.exception.BadRequestException;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import org.flexagent.core.runtime.RuntimeTypes;
import org.flexagent.langchain4j.FlexAgentChatModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import com.agent.mvp.agent.ModelProviderType;

@Configuration
public class AgentConfiguration {

    @Bean
    public ChatLanguageModel langChain4jOpenAiChatModel(AppProperties appProperties) {
        String apiKey = appProperties.getOpenai().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            apiKey = "sk-placeholder";
        }
        
        return OpenAiChatModel.builder()
                .baseUrl(appProperties.getOpenai().getBaseUrl())
                .apiKey(apiKey)
                .modelName(appProperties.getDefaultOpenaiModel())
                .timeout(Duration.ofMillis(appProperties.getModelRuntime().getReadTimeoutMs()))
                .maxRetries(appProperties.getModelRuntime().getIdempotentRetries())
                .build();
    }

    @Bean
    @Primary
    public ChatLanguageModel primaryChatModel(AppProperties appProperties, 
                                              @Qualifier("langChain4jOpenAiChatModel") ChatLanguageModel openAiModel, 
                                              @Qualifier("vertexAiChatModel") ChatLanguageModel vertexAiModel) {
        if (appProperties.getDefaultProvider() == ModelProviderType.VERTEXAI) {
            return vertexAiModel;
        } else {
            return openAiModel;
        }
    }

    @Bean
    public FlexAgentChatModel flexAgentChatModel(ChatLanguageModel delegateModel, com.agent.mvp.agent.tooling.AgentToolOrchestrator toolOrchestrator) throws Exception {
        java.util.List<Object> tools = new java.util.ArrayList<>();
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (com.agent.mvp.agent.tooling.ToolSpec spec : toolOrchestrator.listToolSpecs()) {
            String schemaJson = mapper.writeValueAsString(spec.inputJsonSchema());
            tools.add(new org.flexagent.core.model.ToolDefinition(spec.name(), spec.description(), schemaJson));
        }

        return FlexAgentChatModel.builder()
                .runtime(RuntimeTypes.LANGCHAIN4J)
                .model(delegateModel)
                .tools(tools.toArray())
                .build();
    }
}
