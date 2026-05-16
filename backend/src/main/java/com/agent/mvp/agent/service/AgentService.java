package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ChatStreamMeta;
import com.agent.mvp.agent.dto.AgentExecutionDiagnostics;
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
import com.agent.mvp.config.AppProperties;
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

    private final SessionService sessionService;
    private final ModelRoutingService modelRoutingService;
    private final ModelGateway modelGateway;
    private final AgentToolOrchestrator toolOrchestrator;
    private final ToolAuditService toolAuditService;
    private final ObjectMapper objectMapper;
    private final AppProperties appProperties;

    public AgentService(SessionService sessionService,
                        ModelRoutingService modelRoutingService,
                        ModelGateway modelGateway,
                        AgentToolOrchestrator toolOrchestrator,
                        ToolAuditService toolAuditService,
                        AppProperties appProperties,
                        ObjectMapper objectMapper) {
        this.sessionService = sessionService;
        this.modelRoutingService = modelRoutingService;
        this.modelGateway = modelGateway;
        this.toolOrchestrator = toolOrchestrator;
        this.toolAuditService = toolAuditService;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);
        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());
        AgentLoopResult loop = executeLoop(userId, session, resolved, null);
        return new ChatResponse(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                loop.reply(),
                loop.totalLatencyMs(),
                loop.traces(),
                loop.execution()
        );
    }

    public ChatResponse streamChat(UUID userId,
                                   ChatRequest request,
                                   Consumer<ChatStreamMeta> metaConsumer,
                                   Consumer<String> chunkConsumer) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);

        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());
        metaConsumer.accept(new ChatStreamMeta(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                List.of(),
                "started",
                initialExecutionDiagnostics()
        ));

        AgentLoopResult loop = executeLoop(userId, session, resolved, chunkConsumer);
        metaConsumer.accept(new ChatStreamMeta(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                loop.traces(),
                "completed",
                loop.execution()
        ));
        return new ChatResponse(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                loop.reply(),
                loop.totalLatencyMs(),
                loop.traces(),
                loop.execution()
        );
    }

    private AgentLoopResult executeLoop(UUID userId,
                                        ConversationSession session,
                                        ResolvedModelConfig resolved,
                                        Consumer<String> chunkConsumer) {
        List<MessageResponse> history = sessionService.listRecentMessages(userId, session.getId(), 200);
        int maxContextTokens = maxContextTokens();
        int maxToolSteps = maxToolSteps();
        boolean stopOnToolError = appProperties.getAgent().isStopOnToolError();
        HistoryWindow historyWindow = buildMessages(history, maxContextTokens);
        List<ModelChatMessage> messages = historyWindow.messages();
        List<ToolExecutionResult> traces = new ArrayList<>();
        String reply = "";
        long totalLatencyMs = 0;
        int toolRounds = 0;
        String stopReason = "completed";

        for (int step = 0; step < maxToolSteps; step++) {
            boolean finalStep = step == maxToolSteps - 1;
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
                stopReason = "completed";
                break;
            }
            toolRounds++;

            messages.add(ModelChatMessage.assistantWithToolCalls(reply, toolCalls));
            persistToolCallMessage(session, resolved, toolCalls, reply);

            if (step == maxToolSteps - 1) {
                reply = "Stopped safely: reached max tool steps (" + maxToolSteps + ").";
                stopReason = "max_tool_steps_reached";
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
            if (stopForError && stopOnToolError) {
                reply = "Stopped safely: tool execution returned error.";
                stopReason = "tool_error";
                break;
            }
        }

        persistFinalAssistant(session, resolved, reply, traces);
        toolAuditService.saveAll(userId, session.getId(), resolved.provider().name(), resolved.model(), traces);
        AgentExecutionDiagnostics execution = new AgentExecutionDiagnostics(
                maxContextTokens,
                maxToolSteps,
                historyWindow.historyMessagesUsed(),
                historyWindow.historyTruncated(),
                toolRounds,
                stopReason
        );
        return new AgentLoopResult(reply, totalLatencyMs, traces, execution);
    }

    private AgentExecutionDiagnostics initialExecutionDiagnostics() {
        return new AgentExecutionDiagnostics(
                maxContextTokens(),
                maxToolSteps(),
                0,
                false,
                0,
                "started"
        );
    }

    private HistoryWindow buildMessages(List<MessageResponse> history, int maxContextTokens) {
        List<ModelChatMessage> messages = new ArrayList<>();
        messages.add(ModelChatMessage.of(
                "system",
                "You are a Java AI coding assistant. Use provided tool context as factual repo grounding. " +
                        "If tool context is insufficient, say what extra info is needed."
        ));

        HistoryWindow historyWindow = sliceByTokenBudget(history, maxContextTokens);
        List<ModelChatMessage> historyMessages = historyWindow.messages();
        messages.addAll(historyMessages);
        return new HistoryWindow(messages, historyWindow.historyMessagesUsed(), historyWindow.historyTruncated());
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

    private HistoryWindow sliceByTokenBudget(List<MessageResponse> history, int maxTokens) {
        List<ModelChatMessage> reversed = new ArrayList<>();
        int budget = Math.max(500, maxTokens);
        int used = 0;
        boolean truncated = false;
        for (int i = history.size() - 1; i >= 0; i--) {
            MessageResponse msg = history.get(i);
            String content = msg.content() == null ? "" : msg.content();
            int messageTokens = estimateTokens(msg.role()) + estimateTokens(content) + 8;
            if (used + messageTokens > budget && !reversed.isEmpty()) {
                truncated = true;
                break;
            }
            used += messageTokens;
            reversed.add(ModelChatMessage.of(msg.role(), content));
        }
        List<ModelChatMessage> sliced = new ArrayList<>(reversed.size());
        for (int i = reversed.size() - 1; i >= 0; i--) {
            sliced.add(reversed.get(i));
        }
        return new HistoryWindow(sliced, sliced.size(), truncated);
    }

    private int maxContextTokens() {
        return Math.max(500, appProperties.getAgent().getMaxContextTokens());
    }

    private int maxToolSteps() {
        return Math.max(1, appProperties.getAgent().getMaxToolSteps());
    }

    private int estimateTokens(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        // Lightweight approximation for mixed zh/en code content.
        return Math.max(1, (text.length() + 3) / 4);
    }

    private record AgentLoopResult(String reply,
                                   long totalLatencyMs,
                                   List<ToolExecutionResult> traces,
                                   AgentExecutionDiagnostics execution) {
    }

    private record HistoryWindow(List<ModelChatMessage> messages,
                                 int historyMessagesUsed,
                                 boolean historyTruncated) {
    }
}
