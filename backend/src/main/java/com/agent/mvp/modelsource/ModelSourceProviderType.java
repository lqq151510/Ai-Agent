package com.agent.mvp.modelsource;

import com.agent.mvp.common.exception.BadRequestException;

public enum ModelSourceProviderType {
    OPENAI("openai", true, "/models"),
    DEEPSEEK("deepseek", true, "/models"),
    OPENROUTER("openrouter", true, "/models"),
    LOCAL_COMPATIBLE("local_compatible", true, "/models"),
    ANTHROPIC("anthropic", false, "/v1/models");

    private final String value;
    private final boolean openAiCompatible;
    private final String probePath;

    ModelSourceProviderType(String value, boolean openAiCompatible, String probePath) {
        this.value = value;
        this.openAiCompatible = openAiCompatible;
        this.probePath = probePath;
    }

    public String value() {
        return value;
    }

    public boolean openAiCompatible() {
        return openAiCompatible;
    }

    public String probePath() {
        return probePath;
    }

    public static ModelSourceProviderType from(String raw) {
        for (ModelSourceProviderType type : values()) {
            if (type.value.equalsIgnoreCase(raw)) {
                return type;
            }
        }
        throw new BadRequestException("Unsupported providerType: " + raw);
    }
}
