package com.agent.mvp.settings.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public record SettingsBackupPayload(
        Integer schemaVersion,
        Instant exportedAt,
        SettingsBackupPreferences preferences,
        List<SettingsBackupTag> tags,
        List<SettingsBackupKnowledgeItem> knowledgeItems,
        Boolean modelSourcesIncluded,
        List<SettingsBackupReviewState> reviewStates) {

    public SettingsBackupPayload(
            Integer schemaVersion,
            Instant exportedAt,
            SettingsBackupPreferences preferences,
            List<SettingsBackupTag> tags,
            List<SettingsBackupKnowledgeItem> knowledgeItems,
            Boolean modelSourcesIncluded) {
        this(
                schemaVersion,
                exportedAt,
                preferences,
                tags,
                knowledgeItems,
                modelSourcesIncluded,
                List.of());
    }

    public SettingsBackupPayload {
        reviewStates =
                reviewStates == null
                        ? List.of()
                        : Collections.unmodifiableList(new ArrayList<>(reviewStates));
    }
}
