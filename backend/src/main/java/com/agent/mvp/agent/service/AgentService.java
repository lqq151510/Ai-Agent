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
import com.agent.mvp.agent.tooling.ClientToolRegistry;
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

    private final SessionService sessionService;
    private final ModelRoutingService modelRoutingService;
    private final ModelGateway modelGateway;
    private final AgentToolOrchestrator toolOrchestrator;
    private final ToolAuditService toolAuditService;
    private final ObjectMapper objectMapper;
    private final AppProperties appProperties;
    private final RAGMemoryService ragMemoryService;
    private final ClientToolRegistry clientToolRegistry;
    private final org.flexagent.langchain4j.FlexAgentChatModel flexAgentChatModel;

    public AgentService(SessionService sessionService,
                        ModelRoutingService modelRoutingService,
                        ModelGateway modelGateway,
                        AgentToolOrchestrator toolOrchestrator,
                        ToolAuditService toolAuditService,
                        AppProperties appProperties,
                        ObjectMapper objectMapper,
                        RAGMemoryService ragMemoryService,
                        ClientToolRegistry clientToolRegistry,
                        org.flexagent.langchain4j.FlexAgentChatModel flexAgentChatModel) {
        this.sessionService = sessionService;
        this.modelRoutingService = modelRoutingService;
        this.modelGateway = modelGateway;
        this.toolOrchestrator = toolOrchestrator;
        this.toolAuditService = toolAuditService;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.ragMemoryService = ragMemoryService;
        this.clientToolRegistry = clientToolRegistry;
        this.flexAgentChatModel = flexAgentChatModel;
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);
        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());
        int maxContextTokens = resolveContextTokenBudget(request.maxContextTokens(), session);
        java.util.function.Function<ToolCall, String> rejectClientTool = (call) -> "ERROR: execute_cli_command is only available via streaming chat (/api/v1/agent/chat/stream)";
        AgentLoopResult loop = executeLoop(userId, session, resolved, maxContextTokens, null, request.systemContext(), rejectClientTool);
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
                                   Consumer<String> chunkConsumer,
                                   Consumer<ToolCall> clientToolConsumer) {
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

        java.util.function.Function<ToolCall, String> clientToolInvoker = (call) -> {
            try {
                java.util.concurrent.CompletableFuture<String> future = clientToolRegistry.register(call.id());
                if (clientToolConsumer != null) {
                    clientToolConsumer.accept(call);
                }
                // Wait up to 5 minutes for the client to execute the command and POST the result back
                return future.get(5, java.util.concurrent.TimeUnit.MINUTES);
            } catch (Exception e) {
                return "ERROR: Client execution timed out or failed: " + e.getMessage();
            }
        };

        AgentLoopResult loop = executeLoop(userId, session, resolved, maxContextTokens, chunkConsumer, request.systemContext(), clientToolInvoker);
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
                                        String systemContext,
                                        java.util.function.Function<ToolCall, String> clientToolInvoker) {
        List<MessageResponse> history = sessionService.listMessages(userId, session.getId());
        int maxToolSteps = maxToolSteps();
        boolean stopOnToolError = appProperties.getAgent().isStopOnToolError();
        HistoryWindow historyWindow = buildMessages(userId, history, maxContextTokens, systemContext);
        List<ModelChatMessage> messages = historyWindow.messages();
        List<ToolExecutionResult> traces = new ArrayList<>();
        StringBuilder replyBuilder = new StringBuilder();
        long startMs = System.currentTimeMillis();
        int toolRounds = 0;
        String stopReason = "completed";

        org.flexagent.core.runtime.AgentRuntime runtime = flexAgentChatModel.activeRuntime();
        try {
            if (runtime.getClass().getName().contains("LangChain4jRuntime")) {
                List<dev.langchain4j.data.message.ChatMessage> lc4jMessages = new ArrayList<>();
                for (ModelChatMessage m : messages) {
                    if ("system".equals(m.role())) {
                        lc4jMessages.add(dev.langchain4j.data.message.SystemMessage.from(m.content()));
                    } else if ("user".equals(m.role())) {
                        lc4jMessages.add(dev.langchain4j.data.message.UserMessage.from(m.content()));
                    } else if ("assistant".equals(m.role())) {
                        lc4jMessages.add(dev.langchain4j.data.message.AiMessage.from(m.content() == null ? "" : m.content()));
                    }
                }
                java.lang.reflect.Method setHistory = runtime.getClass().getMethod("setHistoryMessages", List.class);
                setHistory.invoke(runtime, lc4jMessages);
                java.lang.reflect.Method setSession = runtime.getClass().getMethod("setSessionId", String.class);
                setSession.invoke(runtime, session.getId().toString());
            }
        } catch (Exception e) {
            log.warn("Failed to set flexagent history", e);
        }

        // Send the last user message to start reasoning stream
        String lastMessage = "";
        for (int i = messages.size() - 1; i >= 0; i--) {
            if ("user".equals(messages.get(i).role())) {
                lastMessage = messages.get(i).content();
                break;
            }
        }
        
        try {
            runtime.send(lastMessage);

            boolean running = true;
            while (running) {
                org.flexagent.core.model.Step step = runtime.pollStep(100, java.util.concurrent.TimeUnit.MILLISECONDS);
                if (step == null) continue;

                if (step.status() == org.flexagent.core.model.StepStatus.ERROR) {
                    stopReason = "flexagent_error";
                    running = false;
                }

                if (step.type() == org.flexagent.core.model.StepType.TOOL_CALL && !step.toolCalls().isEmpty()) {
                    toolRounds++;
                    if (toolRounds >= maxToolSteps) {
                        stopReason = "max_tool_steps_reached";
                        replyBuilder.append("\n[Stopped safely: reached max tool steps]");
                        running = false;
                        break;
                    }
                    
                    for (org.flexagent.core.model.ToolCall fcTool : step.toolCalls()) {
                        ToolCall localTool = new ToolCall(fcTool.id(), fcTool.name(), fcTool.argumentsJson());
                        ToolResult result = toolOrchestrator.execute(localTool, clientToolInvoker);
                        ToolExecutionResult trace = toTrace(result);
                        traces.add(trace);
                        
                        org.flexagent.core.model.ToolResult fcResult = new org.flexagent.core.model.ToolResult(
                                fcTool.id(), fcTool.name(), null, result.output()
                        );
                        runtime.sendToolResult(fcResult);
                        
                        if (!"SUCCESS".equalsIgnoreCase(result.status()) && stopOnToolError) {
                            stopReason = "tool_error";
                            replyBuilder.append("\n[Stopped safely: tool error]");
                            running = false;
                            break;
                        }
                    }
                }

                if (step.contentDelta() != null && !step.contentDelta().isEmpty()) {
                    replyBuilder.append(step.contentDelta());
                    if (chunkConsumer != null) {
                        chunkConsumer.accept(step.contentDelta());
                    }
                }

                if (Boolean.TRUE.equals(step.isCompleteResponse()) && step.type() == org.flexagent.core.model.StepType.TEXT_RESPONSE) {
                    running = false;
                }
            }
        } catch (Exception e) {
            log.error("FlexAgent runtime error", e);
            stopReason = "exception";
        }

        String reply = replyBuilder.toString();
        long totalLatencyMs = System.currentTimeMillis() - startMs;

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

        int currentPromptTokens = TokenCounter.countTokens(systemPrompt.toString());
        int systemContextBudget = Math.max(0, maxContextTokens - currentPromptTokens - 500);

        String sanitizedSystemContext = sanitizeSystemContext(systemContext, systemContextBudget);
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

    private String sanitizeSystemContext(String systemContext, int tokenBudget) {
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

        while (!sanitized.isBlank() && TokenCounter.countTokens(sanitized) > tokenBudget) {
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
