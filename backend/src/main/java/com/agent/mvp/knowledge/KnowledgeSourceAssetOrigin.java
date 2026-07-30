package com.agent.mvp.knowledge;

import com.agent.mvp.common.exception.BadRequestException;

/** The trusted desktop workflow that supplied a managed original. */
public enum KnowledgeSourceAssetOrigin {
    PICKER("picker"),
    WATCHED_FOLDER("watched_folder");

    private final String value;

    KnowledgeSourceAssetOrigin(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static KnowledgeSourceAssetOrigin from(String raw) {
        if (raw != null) {
            for (KnowledgeSourceAssetOrigin origin : values()) {
                if (origin.value.equalsIgnoreCase(raw.trim())) {
                    return origin;
                }
            }
        }
        throw new BadRequestException("Unsupported source asset origin");
    }
}
