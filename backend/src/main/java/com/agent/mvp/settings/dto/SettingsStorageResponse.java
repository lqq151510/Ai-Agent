package com.agent.mvp.settings.dto;

import java.time.Instant;

public record SettingsStorageResponse(
        long totalItems,
        long inboxItems,
        long readyItems,
        long failedItems,
        long archivedItems,
        long totalTags,
        long totalModelSources,
        Instant generatedAt) {}
