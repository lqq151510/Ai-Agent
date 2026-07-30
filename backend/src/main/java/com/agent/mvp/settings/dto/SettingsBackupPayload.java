package com.agent.mvp.settings.dto;

import java.time.Instant;
import java.util.List;

public record SettingsBackupPayload(
        Integer schemaVersion,
        Instant exportedAt,
        SettingsBackupPreferences preferences,
        List<SettingsBackupTag> tags,
        List<SettingsBackupKnowledgeItem> knowledgeItems,
        Boolean modelSourcesIncluded) {}
