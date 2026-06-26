package com.agent.mvp.ingestion;

import com.agent.mvp.common.exception.BadRequestException;

public enum IngestionJobStatus {
    PENDING("pending"),
    RUNNING("running"),
    SUCCEEDED("succeeded"),
    FAILED("failed");

    private final String value;

    IngestionJobStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static IngestionJobStatus from(String raw) {
        for (IngestionJobStatus status : values()) {
            if (status.value.equalsIgnoreCase(raw)) {
                return status;
            }
        }
        throw new BadRequestException("Unsupported jobStatus: " + raw);
    }
}
