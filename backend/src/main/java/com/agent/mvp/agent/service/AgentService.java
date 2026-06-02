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
    private static final int MIN_CONTEXT_TOKENS = 500;
    private static final int MAX_SYSTEM_CONTEXT_TOKENS = 256;

    private final SessionService sessionService;
    private final ModelRoutingService modelRoutingService;
    private final ModelGateway modelGateway;
    private final AgentToolOrchestrator toolOrchestrator;
    private final ToolAuditService toolAuditService;
    private final ObjectMapper objectMapper;
    private final AppProperties appProperties;
    private final RAGMemoryService ragMemoryService;

    public AgentService(SessionService sessionService,
                        ModelRoutingService modelRoutingService,
                        ModelGateway modelGateway,
                        AgentToolOrchestrator toolOrchestrator,
                        ToolAuditService toolAuditService,
                        AppProperties appProperties,
                        ObjectMapper objectMapper,
                        RAGMemoryService ragMemoryService) {
        this.sessionService = sessionService;
        this.modelRoutingService = modelRoutingService;
        this.modelGateway = modelGateway;
        this.toolOrchestrator = toolOrchestrator;
        this.toolAuditService = toolAuditService;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.ragMemoryService = ragMemoryService;
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);
        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());
        int maxContextTokens = resolveContextTokenBudget(request.maxContextTokens(), session);
        AgentLoopResult loop = executeLoop(userId, session, resolved, maxContextTokens, null, request.systemContext());
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
        int maxContextTokens = resolveContextTokenBudget(request.maxContextTokens(), session);
        metaConsumer.accept(new ChatStreamMeta(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                List.of(),
                "started",
                initialExecutionDiagnostics(maxContextTokens)
        ));

        AgentLoopResult loop = executeLoop(userId, session, resolved, maxContextTokens, chunkConsumer, request.systemContext());
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
                                        int maxContextTokens,
                                        Consumer<String> chunkConsumer,
                                        String systemContext) {
        List<MessageResponse> history = sessionService.listMessages(userId, session.getId());
        int maxToolSteps = maxToolSteps();
        boolean stopOnToolError = appProperties.getAgent().isStopOnToolError();
        HistoryWindow historyWindow = buildMessages(userId, history, maxContextTokens, systemContext);
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

    private AgentExecutionDiagnostics initialExecutionDiagnostics(int maxContextTokens) {
        return new AgentExecutionDiagnostics(
                maxContextTokens,
                maxToolSteps(),
                0,
                false,
                0,
                "started"
        );
    }

    private HistoryWindow buildMessages(UUID userId, List<MessageResponse> history, int maxContextTokens, String systemContext) {
        List<ModelChatMessage> messages = new ArrayList<>();

        String lastUserMessage = "";
        if (history != null && !history.isEmpty()) {
            MessageResponse lastMsg = history.get(history.size() - 1);
            if ("user".equals(lastMsg.role())) {
                lastUserMessage = lastMsg.content();
            }
        }

        List<String> similarDiagnoses = List.of();
        if (lastUserMessage != null && !lastUserMessage.isBlank()) {
            similarDiagnoses = ragMemoryService.searchSimilarDiagnoses(userId, lastUserMessage, 3);
        }

        StringBuilder systemPrompt = new StringBuilder(
                "You are a Java AI coding assistant. Use provided tool context as factual repo grounding. " +
                "If tool context is insufficient, say what extra info is needed."
        );

        if (!similarDiagnoses.isEmpty()) {
            systemPrompt.append("\n\nHere are some relevant historical log diagnoses for reference:\n");
            for (String diagnosis : similarDiagnoses) {
                systemPrompt.append("---\n").append(diagnosis).append("\n");
            }
            systemPrompt.append("---\n");
        }

        String sanitizedSystemContext = sanitizeSystemContext(systemContext);
        if (!sanitizedSystemContext.isBlank()) {
            systemPrompt.append("\n\n# Dynamic Context\n").append(sanitizedSystemContext);
        }

        String promptText = systemPrompt.toString();
        messages.add(ModelChatMessage.of("system", promptText));

        int historyBudget = Math.max(0, maxContextTokens - TokenCounter.countTokens(promptText) - 8);
        HistoryWindow historyWindow = sliceByTokenBudget(history, historyBudget);
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
        int budget = Math.max(0, maxTokens);
        int used = 0;
        boolean truncated = false;
        for (int i = history.size() - 1; i >= 0; i--) {
            MessageResponse msg = history.get(i);
            String content = msg.content() == null ? "" : msg.content();
            int messageTokens = TokenCounter.countTokens(msg.role()) + TokenCounter.countTokens(content) + 8;
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

    private String sanitizeSystemContext(String systemContext) {
        if (systemContext == null || systemContext.isBlank()) {
            return "";
        }

        String sanitized = systemContext
                .replace("\r\n", "\n")
                .replaceAll("Bearer\\s+[A-Za-z0-9._-]+", "Bearer [redacted]")
                .replaceAll("(?i)sk-[A-Za-z0-9]+", "sk-[redacted]")
                .replaceAll("(?im)^.*(?:token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie).*$", "[redacted sensitive line]")
                .replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E]", "")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();

        while (!sanitized.isBlank() && TokenCounter.countTokens(sanitized) > MAX_SYSTEM_CONTEXT_TOKENS) {
            sanitized = sanitized.substring(0, Math.max(0, sanitized.length() - 120)).trim();
        }

        return sanitized;
    }

    private int resolveContextTokenBudget(Integer userProvidedMaxContextTokens, ConversationSession session) {
        if (userProvidedMaxContextTokens != null) {
            return Math.max(MIN_CONTEXT_TOKENS, userProvidedMaxContextTokens);
        }
        if (session != null && session.getContextTokenLimit() != null) {
            return Math.max(MIN_CONTEXT_TOKENS, session.getContextTokenLimit());
        }
        int fallback = Math.max(MIN_CONTEXT_TOKENS, appProperties.getAgent().getMaxContextTokens());
        return fallback;
    }

    private int maxToolSteps() {
        return Math.max(1, appProperties.getAgent().getMaxToolSteps());
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
