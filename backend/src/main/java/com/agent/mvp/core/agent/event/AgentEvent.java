package com.agent.mvp.core.agent.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentEvent implements Serializable {
    private String taskId;
    private String type; // e.g., ROUTER_START, RETRIEVAL_START, GENERATION_CHUNK, DONE, ERROR
    private String sourceAgent; // e.g., ROUTER, RETRIEVAL, GENERATOR, REFLECTOR
    private String content; // The message content or partial chunk
    private Object metadata; // Additional context
    
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();
}
