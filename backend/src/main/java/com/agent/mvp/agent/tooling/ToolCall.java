package com.agent.mvp.agent.tooling;

public record ToolCall(
        String id,
        String name,
        String argumentsJson
) {
}
