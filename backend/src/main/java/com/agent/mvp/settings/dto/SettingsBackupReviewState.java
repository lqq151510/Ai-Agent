package com.agent.mvp.settings.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Portable review cadence only. It deliberately has no content, path, hash, or source asset data.
 */
public record SettingsBackupReviewState(
        UUID knowledgeItemId,
        Instant dueAt,
        Integer intervalDays,
        Double easeFactor,
        Integer repetitions,
        String lastRating,
        Instant lastReviewedAt,
        Instant createdAt,
        Instant updatedAt) {}
