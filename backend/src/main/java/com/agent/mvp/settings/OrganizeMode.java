package com.agent.mvp.settings;

import com.agent.mvp.common.exception.BadRequestException;

public enum OrganizeMode {
    MANUAL("manual"),
    AUTO("auto");

    private final String value;

    OrganizeMode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static OrganizeMode from(String raw) {
        for (OrganizeMode mode : values()) {
            if (mode.value.equalsIgnoreCase(raw)) {
                return mode;
            }
        }
        throw new BadRequestException("Unsupported organizeMode: " + raw);
    }
}
