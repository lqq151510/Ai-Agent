package com.agent.mvp.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.agent.service.FlexRuntimeFactory;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.ModelRoutingService;
import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.flexagent.core.model.Step;
import org.flexagent.core.model.StepStatus;
import org.flexagent.core.model.StepType;
import org.flexagent.core.runtime.AgentRuntime;
import org.junit.jupiter.api.Test;

class FlexAgentIntegrationMockTest {

    @Test
    void testAgentServiceWithFlexAgent() throws Exception {
        SessionService sessionService = mock(SessionService.class);
        ModelRoutingService modelRoutingService = mock(ModelRoutingService.class);
        ModelGateway modelGateway = mock(ModelGateway.class);
        AgentToolOrchestrator toolOrchestrator = mock(AgentToolOrchestrator.class);
        ToolAuditService toolAuditService = mock(ToolAuditService.class);
        AppProperties appProperties = new AppProperties();
        RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        com.agent.mvp.agent.tooling.ClientToolRegistry clientToolRegistry =
                mock(com.agent.mvp.agent.tooling.ClientToolRegistry.class);

        FlexRuntimeFactory flexRuntimeFactory = mock(FlexRuntimeFactory.class);
        AgentRuntime runtime = mock(AgentRuntime.class);
        when(flexRuntimeFactory.createRuntime(any(), any(), any(), any(), any())).thenReturn(runtime);

        com.agent.mvp.agent.service.AgentContextService agentContextService =
                new com.agent.mvp.agent.service.AgentContextService(ragMemoryService, appProperties);
        com.agent.mvp.agent.service.MessageHistoryProcessor messageHistoryProcessor =
                new com.agent.mvp.agent.service.MessageHistoryProcessor(sessionService, agentContextService);
        com.agent.mvp.agent.service.ToolCallManager toolCallManager =
                mock(com.agent.mvp.agent.service.ToolCallManager.class);

        AgentService service =
                new AgentService(
                        sessionService,
                        modelRoutingService,
                        modelGateway,
                        toolOrchestrator,
                        toolAuditService,
                        appProperties,
                        new ObjectMapper(),
                        ragMemoryService,
                        clientToolRegistry,
                        flexRuntimeFactory,
                        mock(com.agent.mvp.auth.service.UserService.class),
                        mock(com.agent.mvp.agent.service.SemanticCacheService.class),
                        agentContextService,
                        new io.micrometer.core.instrument.simple.SimpleMeterRegistry(),
                        messageHistoryProcessor,
                        toolCallManager);

        UUID userId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(UUID.randomUUID());

        when(sessionService.findOwnedSession(userId, session.getId())).thenReturn(session);
        when(modelRoutingService.resolve(any(), any(), any()))
                .thenReturn(new ResolvedModelConfig(ModelProviderType.OPENAI, "gpt-test"));

        // Mock the runtime polling behavior
        Step toolStep = mock(Step.class);
        when(toolStep.status()).thenReturn(StepStatus.DONE);
        when(toolStep.type()).thenReturn(StepType.TOOL_CALL);
        org.flexagent.core.model.ToolCall fcTool =
                new org.flexagent.core.model.ToolCall(
                        "1", "searchCode", java.util.Collections.emptyMap(), "{}", null);
        when(toolStep.toolCalls()).thenReturn(List.of(fcTool));

        Step textStep = mock(Step.class);
        when(textStep.status()).thenReturn(StepStatus.DONE);
        when(textStep.type()).thenReturn(StepType.TEXT_RESPONSE);
        when(textStep.contentDelta()).thenReturn("Hello from flexagent");
        when(textStep.isCompleteResponse()).thenReturn(true);

        when(runtime.pollStep(anyLong(), any(TimeUnit.class)))
                .thenReturn(toolStep)
                .thenReturn(textStep);

        when(toolOrchestrator.execute(any(ToolCall.class), any()))
                .thenReturn(
                        java.util.concurrent.CompletableFuture.completedFuture(
                                new ToolResult("1", "searchCode", "{}", "SUCCESS", 10, "result")));

        // 配置 ToolCallManager mock：返回成功的工具调用结果
        when(toolCallManager.executeToolCalls(any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(
                        new com.agent.mvp.agent.service.ToolCallManager.ToolCallResult(
                                java.util.List.of(
                                        new com.agent.mvp.tooling.dto.ToolExecutionResult(
                                                "searchCode", "{}", "SUCCESS", 10, "result")),
                                false));

        ChatResponse response =
                service.chat(
                        userId, new ChatRequest(session.getId(), "hello", null, null, null, null, null, null));

        assertEquals("Hello from flexagent", response.reply());
        assertEquals("completed", response.execution().stopReason());
        assertEquals(1, response.execution().toolRounds());
    }
}
