package com.agent.reflection.listener;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.input.PromptTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReflectionTaskListener {

    private final ChatLanguageModel chatLanguageModel;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @KafkaListener(topics = KafkaTopicConstants.TOPIC_REFLECTION, groupId = "agent-reflection-group")
    public void onReflectionTask(AgentEvent event) {
        log.info("Received reflection task for agent event: {}", event.getTaskId());

        try {
            // Extract answer and context from metadata
            Map<String, Object> metadata = (Map<String, Object>) event.getMetadata();
            if (metadata == null) {
                throw new IllegalArgumentException("Metadata is required for reflection task");
            }
            
            String answer = (String) metadata.get("answer");
            String context = (String) metadata.get("context");

            if (answer == null || context == null) {
                throw new IllegalArgumentException("Answer and Context are required in metadata");
            }

            // Verify with LLM
            String promptString = "You are a helpful assistant. Verify if the provided answer is grounded in the provided context and has no hallucinations.\n" +
                    "Context:\n{{context}}\n\n" +
                    "Answer:\n{{answer}}\n\n" +
                    "Is the answer fully grounded in the context without hallucinations? Reply with exactly 'YES' or 'NO'.";

            PromptTemplate promptTemplate = PromptTemplate.from(promptString);
            String prompt = promptTemplate.apply(Map.of("context", context, "answer", answer)).text();

            String response = chatLanguageModel.generate(prompt);

            boolean isGrounded = response != null && response.trim().toUpperCase().contains("YES");

            // Prepare final evaluation event
            AgentEvent evalEvent = AgentEvent.builder()
                    .taskId(event.getTaskId())
                    .type(isGrounded ? "DONE" : "ERROR")
                    .sourceAgent("REFLECTION")
                    .content(isGrounded ? "Reflection passed: Answer is grounded." : "Reflection failed: Answer has hallucinations or is not fully grounded.")
                    .metadata(Map.of("evaluation", response))
                    .timestamp(LocalDateTime.now())
                    .build();

            // Send to SSE event topic
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, evalEvent);

            log.info("Reflection completed for task: {}, result: {}", event.getTaskId(), isGrounded ? "DONE" : "ERROR");
        } catch (Exception e) {
            log.error("Error processing reflection task for task {}: {}", event.getTaskId(), e.getMessage(), e);
            AgentEvent errorEvent = AgentEvent.builder()
                    .taskId(event.getTaskId())
                    .type("ERROR")
                    .sourceAgent("REFLECTION")
                    .content("Reflection process failed: " + e.getMessage())
                    .timestamp(LocalDateTime.now())
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, errorEvent);
        }
    }
}
