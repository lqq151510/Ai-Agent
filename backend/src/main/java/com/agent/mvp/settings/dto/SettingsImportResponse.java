package com.agent.mvp.settings.dto;

public record SettingsImportResponse(
        int importedItems,
        int createdTags,
        boolean preferencesRestored,
        boolean modelSourcesRestored,
        String message) {}
