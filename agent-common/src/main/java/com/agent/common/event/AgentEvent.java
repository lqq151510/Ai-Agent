package com.agent.common.event;

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
    private String type; // e.g., START, RUNNING, CHUNK, ERROR, DONE
    private String sourceAgent; // e.g., GATEWAY, ROUTER, RETRIEVAL, GENERATION, REFLECTION
    private String content; // The message content or partial chunk
    private Object metadata; // Additional context
    
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();
}
