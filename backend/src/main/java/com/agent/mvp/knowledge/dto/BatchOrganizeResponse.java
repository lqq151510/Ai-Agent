package com.agent.mvp.knowledge.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BatchOrganizeResponse(
        int requestedLimit,
        int selectedCount,
        int succeededCount,
        int failedCount,
        List<UUID> processedItemIds,
        List<UUID> failedItemIds,
        Instant generatedAt) {}
