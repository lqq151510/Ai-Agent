package com.agent.mvp.coach;

import java.util.UUID;

public record SentinelServicePrincipal(UUID ownerUserId, String source) {
    private static final String DEFAULT_SOURCE = "sentinel";
    private static final int MAX_SOURCE_LENGTH = 64;

    public SentinelServicePrincipal {
        source = normalizeSource(source);
    }

    public SentinelServicePrincipal(UUID ownerUserId) {
        this(ownerUserId, DEFAULT_SOURCE);
    }

    private static String normalizeSource(String value) {
        if (value == null || value.isBlank() || value.length() > MAX_SOURCE_LENGTH) {
            return DEFAULT_SOURCE;
        }
        String normalized = value.trim().replaceAll("[^a-zA-Z0-9._-]", "-");
        return normalized.isBlank() ? DEFAULT_SOURCE : normalized;
    }
}
