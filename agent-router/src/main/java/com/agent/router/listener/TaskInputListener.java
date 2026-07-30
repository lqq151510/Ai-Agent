package com.agent.router.listener;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import dev.langchain4j.model.chat.ChatLanguageModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;

@Component
public class TaskInputListener {

    private static final Logger log = LoggerFactory.getLogger(TaskInputListener.class);

    private static final long LLM_TIMEOUT_SECONDS = 60L;

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ChatLanguageModel chatLanguageModel; // DeepSeek

    public TaskInputListener(KafkaTemplate<String, Object> kafkaTemplate, ChatLanguageModel chatLanguageModel) {
        this.kafkaTemplate = kafkaTemplate;
        this.chatLanguageModel = chatLanguageModel;
    }

    @KafkaListener(topics = KafkaTopicConstants.TOPIC_TASK_INPUT, groupId = "router-group")
    public void onTaskInput(AgentEvent event) {
        String taskId = event.getTaskId();
        String prompt = event.getContent();
        log.info("Received task input for taskId: {}", taskId);

        // 1. Notify frontend: Router is thinking
        AgentEvent statusEvent = AgentEvent.builder()
                .taskId(taskId)
                .type("RUNNING")
                .sourceAgent("ROUTER")
                .content("路由 Agent 正在思考执行计划...")
                .build();
        kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, statusEvent);

        // 2. Use LLM to classify intent and generate plan (with 60s timeout to avoid blocking consumer thread)
        String sysPrompt = "You are a Router Agent. Determine if the user's query requires querying the local knowledge base. "
                + "If no, reply strictly with 'GENERAL_CHAT'. "
                + "If yes, reply strictly with a JSON array representing the execution plan. Example: "
                + "[{\"step\": 1, \"action\": \"search_milvus\", \"target\": \"query concepts\"}, {\"step\": 2, \"action\": \"search_mysql\", \"target\": \"metadata\"}]";
        String classification;
        try {
            classification = CompletableFuture.supplyAsync(
                            () -> chatLanguageModel.generate(sysPrompt + "\nUser Query: " + prompt))
                    .orTimeout(LLM_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .join();
        } catch (CompletionException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            log.error("LLM call failed or timed out for taskId: {}", taskId, cause);
            AgentEvent errorEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("ERROR")
                    .sourceAgent("ROUTER")
                    .content("路由 Agent 调用 LLM 失败或超时，请稍后重试。原因: " + cause.getMessage())
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, errorEvent);
            // Rethrow to trigger DefaultErrorHandler (retry / DLT)
            throw new RuntimeException("LLM call failed for taskId: " + taskId, cause);
        }

        if (classification.contains("GENERAL_CHAT")) {
            // Forward directly to Generation
            AgentEvent genEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("START")
                    .sourceAgent("ROUTER")
                    .content(prompt)
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_GENERATION, taskId, genEvent);
        } else {
            // It's a Knowledge Base task with a generated plan
            // Send the JSON plan to frontend
            AgentEvent planEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("PLAN_GENERATED")
                    .sourceAgent("ROUTER")
                    .content(classification)
                    .metadata(prompt) // store original prompt in metadata
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, planEvent);

            // Send waiting status to show approval buttons
            AgentEvent waitingEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("WAITING_APPROVAL")
                    .sourceAgent("ROUTER")
                    .content("等待用户审批执行计划...")
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, waitingEvent);

            // Note: We DO NOT forward to retrieval yet. We wait for TOPIC_APPROVAL.
        }
    }
}
