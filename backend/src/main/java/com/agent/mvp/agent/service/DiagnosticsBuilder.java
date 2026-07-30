package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.AgentExecutionDiagnostics;
import org.springframework.stereotype.Component;

/**
 * 抽取自 AgentService，统一构造 AgentExecutionDiagnostics，消除 doChat / doStreamChat /
 * executeMainLoop / initialExecutionDiagnostics 中重复的 record 构造逻辑。
 */
@Component
public class DiagnosticsBuilder {

    /** 命中缓存时构造的 diagnostics：toolRounds=0，stopReason="completed_from_cache"。 */
    public AgentExecutionDiagnostics fromCache(int maxContextTokens, int maxToolSteps) {
        return new AgentExecutionDiagnostics(
                maxContextTokens, maxToolSteps, 0, false, 0, "completed_from_cache", null);
    }

    /** 流式开始时构造的 diagnostics：toolRounds=0，stopReason="started"。 */
    public AgentExecutionDiagnostics started(int maxContextTokens, int maxToolSteps) {
        return new AgentExecutionDiagnostics(
                maxContextTokens, maxToolSteps, 0, false, 0, "started", null);
    }

    /** 主循环结束时构造的完整 diagnostics，携带历史窗口与工具轮次信息。 */
    public AgentExecutionDiagnostics completed(
            int maxContextTokens,
            int maxToolSteps,
            int historyMessagesUsed,
            boolean historyTruncated,
            int toolRounds,
            String stopReason,
            Integer totalTokenUsage) {
        return new AgentExecutionDiagnostics(
                maxContextTokens,
                maxToolSteps,
                historyMessagesUsed,
                historyTruncated,
                toolRounds,
                stopReason,
                totalTokenUsage);
    }
}
