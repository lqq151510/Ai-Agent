package com.agent.mvp.modelsource.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("model_usage_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelUsageLog {

    @TableId private UUID id;

    private UUID userId;

    private UUID modelSourceId;

    private String providerType;

    private String modelName;

    private Integer promptTokens;

    private Integer completionTokens;

    private Integer totalTokens;

    private Long latencyMs;

    private String status;

    private String errorMessage;

    private Instant createdAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (promptTokens == null) {
            promptTokens = 0;
        }
        if (completionTokens == null) {
            completionTokens = 0;
        }
        if (totalTokens == null) {
            totalTokens = promptTokens + completionTokens;
        }
        if (latencyMs == null) {
            latencyMs = 0L;
        }
        if (status == null || status.isBlank()) {
            status = "success";
        }
    }
}
