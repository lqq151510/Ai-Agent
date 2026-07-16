package com.agent.mvp.agent.dto;

public record AgentExecutionDiagnostics(
        int maxContextTokens,
        int maxToolSteps,
        int historyMessagesUsed,
        boolean historyTruncated,
        int toolRounds,
        String stopReason,
        Integer totalTokenUsage) {}
