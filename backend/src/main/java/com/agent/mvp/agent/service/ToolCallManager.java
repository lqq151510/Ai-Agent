package com.agent.mvp.agent.service;

import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import com.agent.mvp.tooling.dto.ToolExecutionResult;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import org.flexagent.core.runtime.AgentRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 工具调用管理器，负责执行工具调用、处理结果、并将结果回传给运行时。
 *
 * <p>该组件将原本耦合在 AgentService.executeLoop 中的工具调用逻辑独立出来，便于单独测试和扩展。
 */
@Component
public class ToolCallManager {

    private static final Logger log = LoggerFactory.getLogger(ToolCallManager.class);

    private final AgentToolOrchestrator toolOrchestrator;

    public ToolCallManager(AgentToolOrchestrator toolOrchestrator) {
        this.toolOrchestrator = toolOrchestrator;
    }

    /**
     * 执行一批工具调用，等待全部完成后将结果回传给运行时。
     *
     * @param toolCalls FlexAgent 模型的工具调用列表
     * @param clientToolInvoker 客户端工具调用器
     * @param runtime FlexAgent 运行时，用于回传工具结果
     * @param stopOnToolError 是否在工具出错时停止执行
     * @return 工具调用结果，包含执行轨迹和是否发生错误
     */
    public ToolCallResult executeToolCalls(
            List<org.flexagent.core.model.ToolCall> toolCalls,
            Function<ToolCall, CompletableFuture<String>> clientToolInvoker,
            AgentRuntime runtime,
            boolean stopOnToolError) {

        List<ToolExecutionResult> traces = new ArrayList<>();
        List<CompletableFuture<ToolResult>> futures = new ArrayList<>();

        for (org.flexagent.core.model.ToolCall fcTool : toolCalls) {
            ToolCall localTool = new ToolCall(fcTool.id(), fcTool.name(), fcTool.argumentsJson());
            futures.add(toolOrchestrator.execute(localTool, clientToolInvoker));
        }

        // 等待所有工具调用完成
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        boolean hasError = false;
        for (int i = 0; i < futures.size(); i++) {
            ToolResult result = futures.get(i).join();
            org.flexagent.core.model.ToolCall fcTool = toolCalls.get(i);

            ToolExecutionResult trace = toTrace(result);
            traces.add(trace);

            org.flexagent.core.model.ToolResult fcResult =
                    new org.flexagent.core.model.ToolResult(
                            fcTool.id(), fcTool.name(), null, result.output());
            try {
                runtime.sendToolResult(fcResult);
            } catch (Exception e) {
                log.error("Failed to send tool result to runtime", e);
            }

            if (!"SUCCESS".equalsIgnoreCase(result.status()) && stopOnToolError) {
                hasError = true;
                break;
            }
        }

        return new ToolCallResult(traces, hasError);
    }

    private ToolExecutionResult toTrace(ToolResult result) {
        return new ToolExecutionResult(
                result.toolName(),
                result.argsJson(),
                result.status(),
                result.durationMs(),
                result.output());
    }

    /** 工具调用结果。 */
    public record ToolCallResult(List<ToolExecutionResult> traces, boolean hasError) {}
}
