package com.agent.mvp.ingestion.event;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 知识切片与向量化异步摄取事件。 用于 Kafka 削峰解耦与大规模知识库异步批处理。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeIngestionEvent implements Serializable {
    private static final long serialVersionUID = 1L;

    private UUID jobId;
    private UUID userId;
    private UUID knowledgeItemId;
    private String title;
    private String content;
    private String sourceType;
    private Instant timestamp;
}
