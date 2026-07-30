package com.agent.mvp.knowledge.dto;

import java.util.UUID;

/** Renderer-safe managed-original metadata. */
public record KnowledgeSourceAssetResponse(
        UUID id,
        String originalFilename,
        String mediaType,
        long byteSize,
        String origin,
        String availability) {}
