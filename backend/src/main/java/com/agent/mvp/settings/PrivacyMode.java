package com.agent.mvp.settings;

import com.agent.mvp.common.exception.BadRequestException;

public enum PrivacyMode {
    LOCAL_FIRST("local_first"),
    CLOUD_FIRST("cloud_first");

    private final String value;

    PrivacyMode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static PrivacyMode from(String raw) {
        for (PrivacyMode mode : values()) {
            if (mode.value.equalsIgnoreCase(raw)) {
                return mode;
            }
        }
        throw new BadRequestException("Unsupported privacyMode: " + raw);
    }
}
