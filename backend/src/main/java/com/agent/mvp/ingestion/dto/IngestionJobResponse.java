package com.agent.mvp.ingestion.dto;

import java.time.Instant;
import java.util.UUID;

public record IngestionJobResponse(
        UUID id,
        UUID knowledgeItemId,
        String jobType,
        String status,
        String inputSnapshot,
        String resultSnapshot,
        String errorMessage,
        Instant startedAt,
        Instant finishedAt,
        Instant createdAt) {}
