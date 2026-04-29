package com.agent.mvp.agent.dto;

public record ModelChatResponse(
        String content,
        long latencyMs
) {
}
