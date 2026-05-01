package com.agent.mvp.agent.dto;

import com.agent.mvp.agent.tooling.ToolCall;

import java.util.List;

public record ModelChatMessage(
        String role,
        String content,
        String name,
        String toolCallId,
        List<ToolCall> toolCalls
) {

    public static ModelChatMessage of(String role, String content) {
        return new ModelChatMessage(role, content, null, null, List.of());
    }

    public static ModelChatMessage tool(String toolCallId, String name, String content) {
        return new ModelChatMessage("tool", content, name, toolCallId, List.of());
    }

    public static ModelChatMessage assistantWithToolCalls(String content, List<ToolCall> toolCalls) {
        return new ModelChatMessage("assistant", content, null, null, toolCalls == null ? List.of() : toolCalls);
    }
}
