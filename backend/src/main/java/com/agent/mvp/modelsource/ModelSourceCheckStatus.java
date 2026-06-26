package com.agent.mvp.modelsource;

public enum ModelSourceCheckStatus {
    UNKNOWN("unknown"),
    OK("ok"),
    ERROR("error");

    private final String value;

    ModelSourceCheckStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }
}
