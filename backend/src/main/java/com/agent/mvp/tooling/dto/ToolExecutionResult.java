package com.agent.mvp.tooling.dto;

public record ToolExecutionResult(
        String toolName,
        String argsJson,
        String status,
        long durationMs,
        String output
) {
}
