package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.ModelRoutingService;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import com.agent.mvp.agent.tooling.ToolSpec;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AgentServiceTest {

    @Test
    void chatShouldRunToolLoopThenReturnAssistantAnswer() {
        Fixture f = new Fixture();
        ToolCall call = new ToolCall("call_1", "searchCode", "{\"query\":\"AgentService\"}");

        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("", 10, List.of(call), "tool_calls"))
                .thenReturn(new ModelChatResponse("final answer", 12, List.of(), "stop"));
        when(f.toolOrchestrator.execute(call))
                .thenReturn(new ToolResult("call_1", "searchCode", "{\"query\":\"AgentService\"}", "SUCCESS", 6, "match"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "find AgentService", null, null));

        assertEquals("final answer", response.reply());
        assertEquals(1, response.toolTraces().size());
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
        when(f.toolOrchestrator.execute(call))
                .thenReturn(new ToolResult("call_overflow", "searchCode", "{\"query\":\"x\"}", "SUCCESS", 3, "ok"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "loop", null, null));

        assertEquals("Stopped safely: reached max tool steps (4).", response.reply());
        verify(f.modelGateway, times(4)).chat(eq(ModelProviderType.OPENAI), any());
    }

    @Test
    void chatShouldStopSafelyOnToolError() {
        Fixture f = new Fixture();
        ToolCall call = new ToolCall("call_err", "readFile", "{\"path\":\"missing\"}");
        when(f.modelGateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("", 9, List.of(call), "tool_calls"));
        when(f.toolOrchestrator.execute(call))
                .thenReturn(new ToolResult("call_err", "readFile", "{\"path\":\"missing\"}", "ERROR", 4, "failed"));

        ChatResponse response = f.service.chat(f.userId, new ChatRequest(f.session.getId(), "read missing", null, null));

        assertEquals("Stopped safely: tool execution returned error.", response.reply());
        assertEquals(1, response.toolTraces().size());
        assertEquals("ERROR", response.toolTraces().get(0).status());
        verify(f.modelGateway, times(1)).chat(eq(ModelProviderType.OPENAI), any());
        verify(f.modelGateway, never()).stream(any(), any(), any());
    }

    private static final class Fixture {
        final SessionService sessionService = mock(SessionService.class);
        final ModelRoutingService modelRoutingService = mock(ModelRoutingService.class);
        final ModelGateway modelGateway = mock(ModelGateway.class);
        final AgentToolOrchestrator toolOrchestrator = mock(AgentToolOrchestrator.class);
        final ToolAuditService toolAuditService = mock(ToolAuditService.class);
        final AgentService service = new AgentService(
                sessionService,
                modelRoutingService,
                modelGateway,
                toolOrchestrator,
                toolAuditService,
                new ObjectMapper()
        );
        final UUID userId = UUID.randomUUID();
        final ConversationSession session = new ConversationSession();

        Fixture() {
            session.setId(UUID.randomUUID());
            when(sessionService.findOwnedSession(userId, session.getId())).thenReturn(session);
            when(modelRoutingService.resolve(null, null, session))
                    .thenReturn(new ResolvedModelConfig(ModelProviderType.OPENAI, "gpt-test"));
            when(sessionService.listRecentMessages(userId, session.getId(), 200))
                    .thenReturn(List.of(new MessageResponse(UUID.randomUUID(), "user", "hello", null, "OPENAI", "gpt-test", Instant.now())));
            when(toolOrchestrator.listToolSpecs())
                    .thenReturn(List.of(new ToolSpec("searchCode", "desc", Map.of("type", "object", "properties", Map.of()))));
        }
    }
}
