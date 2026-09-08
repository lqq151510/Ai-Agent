package com.agent.generation.listener;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class GenerationTaskListener {

    private static final Logger log = LoggerFactory.getLogger(GenerationTaskListener.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final StreamingChatModel streamingChatModel;

    public GenerationTaskListener(KafkaTemplate<String, Object> kafkaTemplate, StreamingChatModel streamingChatModel) {
        this.kafkaTemplate = kafkaTemplate;
        this.streamingChatModel = streamingChatModel;
    }

    @KafkaListener(topics = KafkaTopicConstants.TOPIC_GENERATION, groupId = "agent-generation-group")
    public void onGenerationTask(AgentEvent event) {
        String taskId = event.getTaskId();
        log.info("Received generation task for taskId: {}", taskId);

        String query = event.getContent();
        Object metadata = event.getMetadata();
        String context = metadata != null ? metadata.toString() : "";

        String prompt = """
                You are a helpful AI assistant. Use the following context to answer the user's query.

                Context:
                """ + context + """


                Query:
                """ + query;
        if (context.isEmpty()) {
            prompt = query;
        }

        ChatRequest chatRequest = ChatRequest.builder().messages(UserMessage.from(prompt)).build();
        streamingChatModel.chat(chatRequest, new StreamingChatResponseHandler() {
            @Override
            public void onPartialResponse(String partialResponse) {
                AgentEvent chunkEvent = AgentEvent.builder()
                        .taskId(taskId)
                        .type("CHUNK")
                        .sourceAgent("GENERATION")
                        .content(partialResponse)
                        .build();
                kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, chunkEvent);
            }

            @Override
            public void onCompleteResponse(ChatResponse completeResponse) {
                log.info("Generation completed for taskId: {}", taskId);

                AiMessage aiMessage = completeResponse.aiMessage();

                // Notify frontend: Generation finished
                AgentEvent doneEvent = AgentEvent.builder()
                        .taskId(taskId)
                        .type("DONE")
                        .sourceAgent("GENERATION")
                        .content("[GENERATION_DONE]")
                        .build();
                kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, doneEvent);

                // Send final reflection task
                AgentEvent reflectionEvent = AgentEvent.builder()
                        .taskId(taskId)
                        .type("START")
                        .sourceAgent("GENERATION")
                        .content(aiMessage.text())
                        .metadata(metadata)
                        .build();
                kafkaTemplate.send(KafkaTopicConstants.TOPIC_REFLECTION, taskId, reflectionEvent);
            }

            @Override
            public void onError(Throwable error) {
                log.error("Error during generation for taskId: {}", taskId, error);
                AgentEvent errorEvent = AgentEvent.builder()
                        .taskId(taskId)
                        .type("ERROR")
                        .sourceAgent("GENERATION")
                        .content("Generation failed: " + error.getMessage())
                        .build();
                kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, errorEvent);
            }
        });
    }
}
