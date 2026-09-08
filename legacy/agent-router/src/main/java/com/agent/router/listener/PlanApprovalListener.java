package com.agent.router.listener;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class PlanApprovalListener {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public PlanApprovalListener(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @KafkaListener(topics = KafkaTopicConstants.TOPIC_APPROVAL, groupId = "router-approval-group")
    public void onApproval(AgentEvent event) {
        String taskId = event.getTaskId();
        
        if ("PLAN_APPROVED".equals(event.getType())) {
            // Notify frontend
            AgentEvent statusEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("RUNNING")
                    .sourceAgent("ROUTER")
                    .content("计划已批准，开始执行检索...")
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, statusEvent);
            
            // Forward to Retrieval. In a real system, we might pass the JSON plan as metadata, 
            // but here we just pass a simple message to trigger retrieval.
            AgentEvent retEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("START")
                    .sourceAgent("ROUTER")
                    .content("Execute Plan") 
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_RETRIEVAL, taskId, retEvent);
        } else {
            // Rejected
            AgentEvent cancelEvent = AgentEvent.builder()
                    .taskId(taskId)
                    .type("ERROR")
                    .sourceAgent("ROUTER")
                    .content("计划已被用户拒绝，任务终止。")
                    .build();
            kafkaTemplate.send(KafkaTopicConstants.TOPIC_SSE_EVENT, taskId, cancelEvent);
        }
    }
}
