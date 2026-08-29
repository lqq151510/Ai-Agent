package com.agent.mvp.modelsource.dto;

public record PromptTestResponse(
        boolean success,
        String reply,
        int promptTokens,
        int completionTokens,
        int totalTokens,
        long latencyMs,
        String model,
        String message) {}
