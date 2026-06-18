package com.agent.generation.listener;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.StreamingResponseHandler;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.model.output.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class GenerationTaskListener {

    private static final Logger log = LoggerFactory.getLogger(GenerationTaskListener.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final StreamingChatLanguageModel streamingChatModel;

    public GenerationTaskListener(KafkaTemplate<String, Object> kafkaTemplate, StreamingChatLanguageModel streamingChatModel) {
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

        String prompt = "You are a helpful AI assistant. Use the following context to answer the user's query.\n\nContext:\n" + context + "\n\nQuery:\n" + query;
        if (context.isEmpty()) {
            prompt = query;
        }

        streamingChatModel.generate(prompt, new StreamingResponseHandler<AiMessage>() {
            @Override
            public void onNext(String token) {
                AgentEvent chunkEvent = AgentEvent.builder()
                        .taskId(taskId)
                        .type("CHUNK")
                        .sourceAgent("GENERATION")
                        .content(token)
                        .build();
                kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, chunkEvent);
            }

            @Override
            public void onComplete(Response<AiMessage> response) {
                log.info("Generation completed for taskId: {}", taskId);
                
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
                        .content(response.content().text())
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
