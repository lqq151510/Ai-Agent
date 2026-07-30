package com.agent.mvp.knowledge;

import com.agent.mvp.common.exception.BadRequestException;

/** Availability of a managed original without exposing its local storage location. */
public enum KnowledgeSourceAssetAvailability {
    PENDING("pending"),
    AVAILABLE("available"),
    MISSING("missing");

    private final String value;

    KnowledgeSourceAssetAvailability(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static KnowledgeSourceAssetAvailability from(String raw) {
        if (raw != null) {
            for (KnowledgeSourceAssetAvailability availability : values()) {
                if (availability.value.equalsIgnoreCase(raw.trim())) {
                    return availability;
                }
            }
        }
        throw new BadRequestException("Unsupported source asset availability");
    }
}
