package com.agent.mvp.ingestion.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("ingestion_jobs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IngestionJob {

    @TableId private UUID id;

    private UUID userId;

    private UUID knowledgeItemId;

    private String jobType;

    private String status;

    private String inputSnapshot;

    private String resultSnapshot;

    private String errorMessage;

    private Instant startedAt;

    private Instant finishedAt;

    private Instant createdAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
