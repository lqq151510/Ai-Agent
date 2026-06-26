package com.agent.mvp.knowledge;

import com.agent.mvp.common.exception.BadRequestException;

public enum KnowledgeItemStatus {
    INBOX("inbox"),
    PROCESSING("processing"),
    READY("ready"),
    FAILED("failed"),
    ARCHIVED("archived");

    private final String value;

    KnowledgeItemStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static KnowledgeItemStatus from(String raw) {
        for (KnowledgeItemStatus status : values()) {
            if (status.value.equalsIgnoreCase(raw)) {
                return status;
            }
        }
        throw new BadRequestException("Unsupported status: " + raw);
    }
}
