package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import org.flexagent.core.runtime.AgentRuntime;
import org.junit.jupiter.api.Test;

class ToolCallManagerTest {

    private final AgentToolOrchestrator orchestrator = mock(AgentToolOrchestrator.class);
    private final AgentRuntime runtime = mock(AgentRuntime.class);
    private final ToolCallManager manager = new ToolCallManager(orchestrator);
    private final Function<ToolCall, CompletableFuture<String>> invoker =
            ignored -> CompletableFuture.completedFuture("unused");

    @Test
    void executeToolCallsShouldReturnEmptyResultForEmptyBatch() {
        var result = manager.executeToolCalls(List.of(), invoker, runtime, true);

        assertTrue(result.traces().isEmpty());
        assertFalse(result.hasError());
    }

    @Test
    void executeToolCallsShouldSendSuccessAndNormalizeNullableTraceFields() throws Exception {
        var call = flexCall("1", "searchCode");
        when(orchestrator.execute(any(ToolCall.class), any()))
                .thenReturn(
                        CompletableFuture.completedFuture(
                                new ToolResult("1", null, null, null, 5, "ok")));

        var result = manager.executeToolCalls(List.of(call), invoker, runtime, false);

        assertFalse(result.hasError());
        assertEquals(1, result.traces().size());
        assertEquals("unknown", result.traces().getFirst().toolName());
        assertEquals("{}", result.traces().getFirst().argsJson());
        assertEquals("ERROR", result.traces().getFirst().status());
        verify(runtime).sendToolResult(any(org.flexagent.core.model.ToolResult.class));
    }

    @Test
    void executeToolCallsShouldConvertExceptionalAndNullFuturesToErrors() throws Exception {
        var first = flexCall("1", "first");
        var second = flexCall("2", "second");
        when(orchestrator.execute(any(ToolCall.class), any()))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("boom")))
                .thenReturn(CompletableFuture.completedFuture(null));

        var result = manager.executeToolCalls(List.of(first, second), invoker, runtime, false);

        assertFalse(result.hasError());
        assertEquals(2, result.traces().size());
        assertTrue(result.traces().get(0).output().contains("boom"));
        assertEquals("ERROR: tool returned null", result.traces().get(1).output());
        verify(runtime, times(2)).sendToolResult(any(org.flexagent.core.model.ToolResult.class));
    }

    @Test
    void executeToolCallsShouldStopAfterFirstErrorAndIgnoreRuntimeSendFailure() throws Exception {
        var first = flexCall("1", "first");
        var second = flexCall("2", "second");
        when(orchestrator.execute(any(ToolCall.class), any()))
                .thenReturn(
                        CompletableFuture.completedFuture(
                                new ToolResult("1", "first", "{}", "ERROR", 1, "denied")))
                .thenReturn(
                        CompletableFuture.completedFuture(
                                new ToolResult("2", "second", "{}", "SUCCESS", 1, "ok")));
        doThrow(new IOException("runtime unavailable"))
                .when(runtime)
                .sendToolResult(any(org.flexagent.core.model.ToolResult.class));

        var result = manager.executeToolCalls(List.of(first, second), invoker, runtime, true);

        assertTrue(result.hasError());
        assertEquals(1, result.traces().size());
        assertEquals("denied", result.traces().getFirst().output());
        verify(runtime).sendToolResult(any(org.flexagent.core.model.ToolResult.class));
    }

    private static org.flexagent.core.model.ToolCall flexCall(String id, String name) {
        return new org.flexagent.core.model.ToolCall(id, name, Map.of(), "{}", null);
    }
}
