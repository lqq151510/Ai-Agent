package com.agent.mvp.agent.tooling;

public record ToolResult(
        String callId,
        String toolName,
        String argsJson,
        String status,
        long durationMs,
        String output
) {
}
