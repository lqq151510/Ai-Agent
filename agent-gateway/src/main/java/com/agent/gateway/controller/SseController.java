package com.agent.gateway.controller;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import org.springframework.http.MediaType;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/v1/agent")
@CrossOrigin(origins = "*")
public class SseController {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    // Store Sinks per TaskId
    private final Map<String, Sinks.Many<AgentEvent>> taskSinks = new ConcurrentHashMap<>();

    public SseController(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @PostMapping("/task")
    public String submitTask(@RequestBody Map<String, String> request) {
        String taskId = UUID.randomUUID().toString();
        String prompt = request.get("prompt");
        
        // Initialize Sink for this task
        Sinks.Many<AgentEvent> sink = Sinks.many().multicast().onBackpressureBuffer();
        taskSinks.put(taskId, sink);

        // Send task to Kafka
        AgentEvent event = AgentEvent.builder()
                .taskId(taskId)
                .type("START")
                .sourceAgent("GATEWAY")
                .content(prompt)
                .build();
                
        kafkaTemplate.send(KafkaTopicConstants.TOPIC_TASK_INPUT, taskId, event);
        
        return taskId;
    }

    @GetMapping(value = "/stream/{taskId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<AgentEvent> streamTask(@PathVariable String taskId) {
        Sinks.Many<AgentEvent> sink = taskSinks.get(taskId);
        if (sink == null) {
            return Flux.error(new IllegalArgumentException("Task ID not found or already completed"));
        }
        return sink.asFlux().doFinally(signalType -> taskSinks.remove(taskId));
    }

    @PostMapping("/task/{taskId}/approve")
    public String approvePlan(@PathVariable String taskId, @RequestBody Map<String, Boolean> request) {
        Boolean approved = request.getOrDefault("approved", false);
        AgentEvent event = AgentEvent.builder()
                .taskId(taskId)
                .type(approved ? "PLAN_APPROVED" : "PLAN_REJECTED")
                .sourceAgent("GATEWAY")
                .content(approved ? "Approved by user" : "Rejected by user")
                .build();
        kafkaTemplate.send(KafkaTopicConstants.TOPIC_APPROVAL, taskId, event);
        return "Approval status received";
    }

    @KafkaListener(topics = KafkaTopicConstants.TOPIC_SSE_EVENT, groupId = "gateway-group")
    public void consumeSseEvent(AgentEvent event) {
        Sinks.Many<AgentEvent> sink = taskSinks.get(event.getTaskId());
        if (sink != null) {
            sink.tryEmitNext(event);
            if ("DONE".equals(event.getType()) || "ERROR".equals(event.getType())) {
                sink.tryEmitComplete();
                taskSinks.remove(event.getTaskId());
            }
        }
    }
}
