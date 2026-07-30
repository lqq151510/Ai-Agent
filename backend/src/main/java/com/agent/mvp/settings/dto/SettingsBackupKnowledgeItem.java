package com.agent.mvp.settings.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SettingsBackupKnowledgeItem(
        UUID id,
        String sourceType,
        String title,
        String sourceUri,
        String rawContent,
        String cleanedContent,
        String summary,
        String status,
        String language,
        Integer wordCount,
        Instant createdAt,
        Instant updatedAt,
        Instant archivedAt,
        SettingsBackupSourceAsset sourceAsset,
        List<UUID> tagIds) {}
