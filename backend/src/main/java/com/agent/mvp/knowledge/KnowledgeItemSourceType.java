package com.agent.mvp.knowledge;

import com.agent.mvp.common.exception.BadRequestException;

public enum KnowledgeItemSourceType {
    WEB("web"),
    MARKDOWN("markdown"),
    PDF("pdf"),
    SNIPPET("snippet");

    private final String value;

    KnowledgeItemSourceType(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static KnowledgeItemSourceType from(String raw) {
        for (KnowledgeItemSourceType type : values()) {
            if (type.value.equalsIgnoreCase(raw)) {
                return type;
            }
        }
        throw new BadRequestException("Unsupported sourceType: " + raw);
    }
}
