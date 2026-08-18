package com.agent.mvp.settings.dto;

import java.util.UUID;

/**
 * Portable, renderer-safe source-asset metadata. It intentionally omits hashes and storage details.
 */
public record SettingsBackupSourceAsset(
        UUID id,
        String originalFilename,
        String mediaType,
        Long byteSize,
        String origin,
        String availability) {}
