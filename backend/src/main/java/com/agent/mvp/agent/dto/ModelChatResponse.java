package com.agent.mvp.agent.dto;

import com.agent.mvp.agent.tooling.ToolCall;

import java.util.List;

public record ModelChatResponse(
        String content,
        long latencyMs,
        List<ToolCall> toolCalls,
        String finishReason
) {
}
