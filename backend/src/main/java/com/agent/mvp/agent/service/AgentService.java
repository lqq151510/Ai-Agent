package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ChatStreamMeta;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.dto.ToolExecutionResult;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

@Service
public class AgentService {
    private static final Logger log = LoggerFactory.getLogger(AgentService.class);

    private static final int MAX_CONTEXT_TOKENS = 6_000;
    private static final int MAX_TOOL_STEPS = 4;

    private final SessionService sessionService;
    private final ModelRoutingService modelRoutingService;
    private final ModelGateway modelGateway;
    private final AgentToolOrchestrator toolOrchestrator;
    private final ToolAuditService toolAuditService;
    private final ObjectMapper objectMapper;

    public AgentService(SessionService sessionService,
                        ModelRoutingService modelRoutingService,
                        ModelGateway modelGateway,
                        AgentToolOrchestrator toolOrchestrator,
                        ToolAuditService toolAuditService,
                        ObjectMapper objectMapper) {
        this.sessionService = sessionService;
        this.modelRoutingService = modelRoutingService;
        this.modelGateway = modelGateway;
        this.toolOrchestrator = toolOrchestrator;
        this.toolAuditService = toolAuditService;
        this.objectMapper = objectMapper;
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);
        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());
        AgentLoopResult loop = executeLoop(userId, session, resolved, null);
        return new ChatResponse(session.getId(), resolved.provider(), resolved.model(), loop.reply(), loop.totalLatencyMs(), loop.traces());
    }

    public ChatResponse streamChat(UUID userId,
                                   ChatRequest request,
                                   Consumer<ChatStreamMeta> metaConsumer,
                                   Consumer<String> chunkConsumer) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);

        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());
        metaConsumer.accept(new ChatStreamMeta(session.getId(), resolved.provider(), resolved.model(), List.of()));

        AgentLoopResult loop = executeLoop(userId, session, resolved, chunkConsumer);
        metaConsumer.accept(new ChatStreamMeta(session.getId(), resolved.provider(), resolved.model(), loop.traces()));
        return new ChatResponse(session.getId(), resolved.provider(), resolved.model(), loop.reply(), loop.totalLatencyMs(), loop.traces());
    }

    private AgentLoopResult executeLoop(UUID userId,
                                        ConversationSession session,
                                        ResolvedModelConfig resolved,
                                        Consumer<String> chunkConsumer) {
        List<MessageResponse> history = sessionService.listRecentMessages(userId, session.getId(), 200);
        List<ModelChatMessage> messages = buildMessages(history);
        List<ToolExecutionResult> traces = new ArrayList<>();
        String reply = "";
        long totalLatencyMs = 0;

        for (int step = 0; step < MAX_TOOL_STEPS; step++) {
            boolean finalStep = step == MAX_TOOL_STEPS - 1;
            ModelChatRequest modelRequest = new ModelChatRequest(
                    resolved.model(),
                    messages,
                    toolOrchestrator.listToolSpecs(),
                    "auto"
            );
            ModelChatResponse modelResponse = (chunkConsumer != null && finalStep)
                    ? modelGateway.stream(resolved.provider(), modelRequest, chunkConsumer)
                    : modelGateway.chat(resolved.provider(), modelRequest);
            totalLatencyMs += modelResponse.latencyMs();
            reply = modelResponse.content() == null ? "" : modelResponse.content();

            List<ToolCall> toolCalls = modelResponse.toolCalls() == null ? List.of() : modelResponse.toolCalls();
            if (toolCalls.isEmpty()) {
                break;
            }

            messages.add(ModelChatMessage.assistantWithToolCalls(reply, toolCalls));
            persistToolCallMessage(session, resolved, toolCalls, reply);

            if (step == MAX_TOOL_STEPS - 1) {
                reply = "Stopped safely: reached max tool steps (4).";
                break;
            }

            boolean stopForError = false;
            for (ToolCall call : toolCalls) {
                ToolResult result = toolOrchestrator.execute(call);
                ToolExecutionResult trace = toTrace(result);
                traces.add(trace);
                messages.add(ModelChatMessage.tool(call.id(), call.name(), result.output()));
                persistToolResultMessage(session, resolved, trace);
                if (!"SUCCESS".equalsIgnoreCase(result.status())) {
                    stopForError = true;
                }
            }
            if (stopForError) {
                reply = "Stopped safely: tool execution returned error.";
                break;
            }
        }

        persistFinalAssistant(session, resolved, reply, traces);
        toolAuditService.saveAll(userId, session.getId(), resolved.provider().name(), resolved.model(), traces);
        return new AgentLoopResult(reply, totalLatencyMs, traces);
    }

    private List<ModelChatMessage> buildMessages(List<MessageResponse> history) {
        List<ModelChatMessage> messages = new ArrayList<>();
        messages.add(ModelChatMessage.of(
                "system",
                "You are a Java AI coding assistant. Use provided tool context as factual repo grounding. " +
                        "If tool context is insufficient, say what extra info is needed."
        ));

        List<ModelChatMessage> historyMessages = sliceByTokenBudget(history, MAX_CONTEXT_TOKENS);
        messages.addAll(historyMessages);
        return messages;
    }

    private void persistToolCallMessage(ConversationSession session,
                                        ResolvedModelConfig resolved,
                                        List<ToolCall> calls,
                                        String assistantDraft) {
        sessionService.saveMessage(
                session,
                "assistant",
                assistantDraft == null ? "" : assistantDraft,
                toJson(calls),
                resolved.provider().name(),
                resolved.model()
        );
    }

    private void persistToolResultMessage(ConversationSession session,
                                          ResolvedModelConfig resolved,
                                          ToolExecutionResult trace) {
        sessionService.saveMessage(
                session,
                "tool",
                trace.output() == null ? "" : trace.output(),
                toJson(trace),
                resolved.provider().name(),
                resolved.model()
        );
    }

    private void persistFinalAssistant(ConversationSession session,
                                       ResolvedModelConfig resolved,
                                       String reply,
                                       List<ToolExecutionResult> traces) {
        sessionService.saveMessage(
                session,
                "assistant",
                reply == null ? "" : reply,
                toJson(traces),
                resolved.provider().name(),
                resolved.model()
        );
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            log.warn("Failed to serialize tool trace payload", ex);
            return "[]";
        }
    }

    private ToolExecutionResult toTrace(ToolResult result) {
        return new ToolExecutionResult(result.toolName(), result.argsJson(), result.status(), result.durationMs(), result.output());
    }

    private List<ModelChatMessage> sliceByTokenBudget(List<MessageResponse> history, int maxTokens) {
        List<ModelChatMessage> reversed = new ArrayList<>();
        int budget = Math.max(500, maxTokens);
        int used = 0;
        for (int i = history.size() - 1; i >= 0; i--) {
            MessageResponse msg = history.get(i);
            String content = msg.content() == null ? "" : msg.content();
            int messageTokens = estimateTokens(msg.role()) + estimateTokens(content) + 8;
            if (used + messageTokens > budget && !reversed.isEmpty()) {
                break;
            }
            used += messageTokens;
            reversed.add(ModelChatMessage.of(msg.role(), content));
        }
        List<ModelChatMessage> sliced = new ArrayList<>(reversed.size());
        for (int i = reversed.size() - 1; i >= 0; i--) {
            sliced.add(reversed.get(i));
        }
        return sliced;
    }

    private int estimateTokens(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        // Lightweight approximation for mixed zh/en code content.
        return Math.max(1, (text.length() + 3) / 4);
    }

    private record AgentLoopResult(String reply, long totalLatencyMs, List<ToolExecutionResult> traces) {
    }
}
