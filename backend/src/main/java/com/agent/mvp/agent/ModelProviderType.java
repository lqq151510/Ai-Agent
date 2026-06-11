package com.agent.mvp.agent;

public enum ModelProviderType {
    OPENAI("openai", "OpenAI Compatible", "chat.completions", true),
    VERTEXAI("vertexai", "Vertex AI (Gemini)", "gemini", false);

    private final String providerId;
    private final String displayName;
    private final String apiStyle;
    private final boolean openAiCompatible;

    ModelProviderType(String providerId,
                      String displayName,
                      String apiStyle,
                      boolean openAiCompatible) {
        this.providerId = providerId;
        this.displayName = displayName;
        this.apiStyle = apiStyle;
        this.openAiCompatible = openAiCompatible;
    }

    public String providerId() {
        return providerId;
    }

    public String displayName() {
        return displayName;
    }

    public String apiStyle() {
        return apiStyle;
    }

    public boolean openAiCompatible() {
        return openAiCompatible;
    }
}
