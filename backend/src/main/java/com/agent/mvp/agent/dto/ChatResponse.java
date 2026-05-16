package com.agent.mvp.agent.dto;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.tooling.dto.ToolExecutionResult;

import java.util.List;
import java.util.UUID;

public record ChatResponse(
        UUID sessionId,
        ModelProviderType provider,
        String model,
        String reply,
        long latencyMs,
        List<ToolExecutionResult> toolTraces,
        AgentExecutionDiagnostics execution
) {
}
