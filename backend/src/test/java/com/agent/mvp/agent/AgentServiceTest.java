package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.ModelRoutingService;
import com.agent.mvp.agent.service.TokenCounter;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import com.agent.mvp.agent.tooling.ToolSpec;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.agent.mvp.agent.service.RAGMemoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Disabled;

@Disabled("Replaced by FlexAgent execution loop")
class AgentServiceTest {

    @Test
    void chatShouldRunToolLoopThenReturnAssistantAnswer() {
        Fixture f = new Fixture();
        ToolCall call = new ToolCall("call_1", "searchCode", "{\"query\":\"AgentService\"}");

        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("", 10, List.of(call), "tool_calls"))
                .thenReturn(new ModelChatResponse("final answer", 12, List.of(), "stop"));
        when(f.toolOrchestrator.execute(eq(call), any()))
                .thenReturn(new ToolResult("call_1", "searchCode", "{\"query\":\"AgentService\"}", "SUCCESS", 6, "match"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "find AgentService", null, null, null, null));

        assertEquals("final answer", response.reply());
        assertEquals(1, response.toolTraces().size());
        assertEquals("completed", response.execution().stopReason());
        verify(f.modelGateway, times(2)).chat(eq(ModelProviderType.OPENAI), any());
        verify(f.sessionService, times(1)).saveMessage(eq(f.session), eq("tool"), eq("match"), any(), eq("OPENAI"), eq("gpt-test"));
    }

    @Test
    void chatShouldStopSafelyWhenToolCallsOverflow() {
        Fixture f = new Fixture();
        ToolCall call = new ToolCall("call_overflow", "searchCode", "{\"query\":\"x\"}");
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("", 8, List.of(call), "tool_calls"))
                .thenReturn(new ModelChatResponse("", 8, List.of(call), "tool_calls"))
                .thenReturn(new ModelChatResponse("", 8, List.of(call), "tool_calls"))
                .thenReturn(new ModelChatResponse("", 8, List.of(call), "tool_calls"));
        when(f.toolOrchestrator.execute(eq(call), any()))
                .thenReturn(new ToolResult("call_overflow", "searchCode", "{\"query\":\"x\"}", "SUCCESS", 3, "ok"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "loop", null, null, null, null));

        assertEquals("Stopped safely: reached max tool steps (4).", response.reply());
        assertEquals("max_tool_steps_reached", response.execution().stopReason());
        verify(f.modelGateway, times(4)).chat(eq(ModelProviderType.OPENAI), any());
    }

    @Test
    void chatShouldStopSafelyOnToolError() {
        Fixture f = new Fixture();
        ToolCall call = new ToolCall("call_err", "readFile", "{\"path\":\"missing\"}");
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("", 9, List.of(call), "tool_calls"));
        when(f.toolOrchestrator.execute(eq(call), any()))
                .thenReturn(new ToolResult("call_err", "readFile", "{\"path\":\"missing\"}", "ERROR", 4, "failed"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "read missing", null, null, null, null));

        assertEquals("Stopped safely: tool execution returned error.", response.reply());
        assertEquals(1, response.toolTraces().size());
        assertEquals("ERROR", response.toolTraces().get(0).status());
        assertEquals("tool_error", response.execution().stopReason());
        verify(f.modelGateway, times(1)).chat(eq(ModelProviderType.OPENAI), any());
        verify(f.modelGateway, never()).stream(any(), any(), any());
    }

    @Test
    void chatShouldUseConfiguredMaxToolSteps() {
        Fixture f = new Fixture();
        f.appProperties.getAgent().setMaxToolSteps(2);
        ToolCall call = new ToolCall("call_overflow", "searchCode", "{\"query\":\"x\"}");
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("", 8, List.of(call), "tool_calls"))
                .thenReturn(new ModelChatResponse("", 8, List.of(call), "tool_calls"));
        when(f.toolOrchestrator.execute(eq(call), any()))
                .thenReturn(new ToolResult("call_overflow", "searchCode", "{\"query\":\"x\"}", "SUCCESS", 3, "ok"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "loop", null, null, null, null));

        assertEquals("Stopped safely: reached max tool steps (2).", response.reply());
        assertEquals(2, response.execution().maxToolSteps());
        verify(f.modelGateway, times(2)).chat(eq(ModelProviderType.OPENAI), any());
    }

    @Test
    void chatShouldRespectUserProvidedContextTokenBudget() {
        Fixture f = new Fixture();
        f.appProperties.getAgent().setMaxContextTokens(6000);
        f.session.setContextTokenLimit(2400);
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("done", 6, List.of(), "stop"));

        ChatResponse response = f.service.chat(
                f.userId,
                new ChatRequest(f.session.getId(), "budget test", null, null, 1800, null)
        );

        assertEquals("done", response.reply());
        assertEquals(1800, response.execution().maxContextTokens());
    }

    @Test
    void chatShouldFallbackToSessionContextTokenBudget() {
        Fixture f = new Fixture();
        f.appProperties.getAgent().setMaxContextTokens(6000);
        f.session.setContextTokenLimit(2600);
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("done", 7, List.of(), "stop"));

        ChatResponse response = f.service.chat(
                f.userId,
                new ChatRequest(f.session.getId(), "session budget", null, null, null, null)
        );

        assertEquals("done", response.reply());
        assertEquals(2600, response.execution().maxContextTokens());
    }

    @Test
    void chatShouldSanitizeSystemContextAndApplyItToBudget() {
        Fixture f = new Fixture();
        f.appProperties.getAgent().setMaxContextTokens(900);
        when(f.sessionService.listMessages(eq(f.userId), eq(f.session.getId())))
                .thenReturn(List.of(
                        message("user", "latest user message"),
                        message("assistant", "assistant history"),
                        message("user", "older user message")
                ));
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("done", 5, List.of(), "stop"));

        f.service.chat(
                f.userId,
                new ChatRequest(
                        f.session.getId(),
                        "budgeted request",
                        null,
                        null,
                        900,
                        "Authorization: Bearer SECRET123\n" + "ctx ".repeat(800)
                )
        );

        ArgumentCaptor<ModelChatRequest> captor = ArgumentCaptor.forClass(ModelChatRequest.class);
        verify(f.modelGateway).chat(eq(ModelProviderType.OPENAI), captor.capture());
        ModelChatRequest request = captor.getValue();
        String systemPrompt = request.messages().get(0).content();

        assertTrue(systemPrompt.contains("# Dynamic Context"));
        assertFalse(systemPrompt.contains("SECRET123"));
        assertTrue(systemPrompt.contains("[redacted sensitive line]"));
        assertTrue(TokenCounter.countTokens(systemPrompt) <= 400);
        assertTrue(request.messages().size() <= 4);
    }

    private static MessageResponse message(String role, String content) {
        return new MessageResponse(UUID.randomUUID(), role, content, null, "OPENAI", "gpt-test", Instant.now());
    }

    private static final class Fixture {
        final SessionService sessionService = mock(SessionService.class);
        final ModelRoutingService modelRoutingService = mock(ModelRoutingService.class);
        final ModelGateway modelGateway = mock(ModelGateway.class);
        final AgentToolOrchestrator toolOrchestrator = mock(AgentToolOrchestrator.class);
        final ToolAuditService toolAuditService = mock(ToolAuditService.class);
        final AppProperties appProperties = new AppProperties();
        final RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        final AgentService service = new AgentService(
                sessionService,
                modelRoutingService,
                modelGateway,
                toolOrchestrator,
                toolAuditService,
                appProperties,
                new ObjectMapper(),
                ragMemoryService,
                mock(com.agent.mvp.agent.tooling.ClientToolRegistry.class),
                mock(org.flexagent.langchain4j.FlexAgentChatModel.class)
        );
        final UUID userId = UUID.randomUUID();
        final ConversationSession session = new ConversationSession();

        Fixture() {
            session.setId(UUID.randomUUID());
            when(sessionService.findOwnedSession(userId, session.getId())).thenReturn(session);
            when(modelRoutingService.resolve(null, null, session))
                    .thenReturn(new ResolvedModelConfig(ModelProviderType.OPENAI, "gpt-test"));
            when(sessionService.listMessages(userId, session.getId()))
                    .thenReturn(List.of(new MessageResponse(UUID.randomUUID(), "user", "hello", null, "OPENAI", "gpt-test", Instant.now())));
            when(toolOrchestrator.listToolSpecs())
                    .thenReturn(List.of(new ToolSpec("searchCode", "desc", Map.of("type", "object", "properties", Map.of()))));
        }
    }
}
