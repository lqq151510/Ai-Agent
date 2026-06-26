package com.agent.mvp.ingestion;

import com.agent.mvp.common.exception.BadRequestException;

public enum IngestionJobType {
    IMPORT("import"),
    ORGANIZE("organize"),
    REPROCESS("reprocess");

    private final String value;

    IngestionJobType(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static IngestionJobType from(String raw) {
        for (IngestionJobType type : values()) {
            if (type.value.equalsIgnoreCase(raw)) {
                return type;
            }
        }
        throw new BadRequestException("Unsupported jobType: " + raw);
    }
}
