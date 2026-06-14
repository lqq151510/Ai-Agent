package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.AgentExecutionDiagnostics;
import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ChatStreamMeta;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ClientToolRegistry;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.agent.tooling.ToolResult;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.UserService;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.dto.ToolExecutionResult;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import org.flexagent.core.runtime.AgentRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

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
    private final FlexRuntimeFactory flexRuntimeFactory;
    private final UserService userService;
    private final SemanticCacheService semanticCacheService;
    private final AgentContextService agentContextService;

    public AgentService(
            SessionService sessionService,
            ModelRoutingService modelRoutingService,
            ModelGateway modelGateway,
            AgentToolOrchestrator toolOrchestrator,
            ToolAuditService toolAuditService,
            AppProperties appProperties,
            ObjectMapper objectMapper,
            RAGMemoryService ragMemoryService,
            ClientToolRegistry clientToolRegistry,
            FlexRuntimeFactory flexRuntimeFactory,
            UserService userService,
            SemanticCacheService semanticCacheService,
            AgentContextService agentContextService) {
        this.sessionService = sessionService;
        this.modelRoutingService = modelRoutingService;
        this.modelGateway = modelGateway;
        this.toolOrchestrator = toolOrchestrator;
        this.toolAuditService = toolAuditService;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.ragMemoryService = ragMemoryService;
        this.clientToolRegistry = clientToolRegistry;
        this.flexRuntimeFactory = flexRuntimeFactory;
        this.userService = userService;
        this.semanticCacheService = semanticCacheService;
        this.agentContextService = agentContextService;
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved =
                modelRoutingService.resolve(request.provider(), request.model(), session);
        sessionService.saveMessage(
                session,
                "user",
                request.message(),
                null,
                resolved.provider().name(),
                resolved.model());
        int maxContextTokens = agentContextService.resolveContextTokenBudget(request.maxContextTokens(), session);

        Optional<String> cachedResponseOpt =
                semanticCacheService.findCachedResponse(request.message());
        if (cachedResponseOpt.isPresent()) {
            String cachedResponse = cachedResponseOpt.get();
            sessionService.saveMessage(
                    session,
                    "assistant",
                    cachedResponse,
                    null,
                    resolved.provider().name(),
                    resolved.model());
            AgentExecutionDiagnostics execution =
                    new AgentExecutionDiagnostics(
                            maxContextTokens, maxToolSteps(), 0, false, 0, "completed_from_cache");
            return new ChatResponse(
                    session.getId(),
                    resolved.provider(),
                    resolved.model(),
                    cachedResponse,
                    0,
                    List.of(),
                    execution);
        }

        java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>>
                rejectClientTool =
                        (call) ->
                                java.util.concurrent.CompletableFuture.completedFuture(
                                        "ERROR: execute_cli_command is only available via streaming"
                                                + " chat (/api/v1/agent/chat/stream)");
        AgentLoopResult loop =
                executeLoop(
                        userId,
                        session,
                        resolved,
                        maxContextTokens,
                        null,
                        request.systemContext(),
                        request.customBaseUrl(),
                        request.customApiKey(),
                        rejectClientTool);

        if (loop.reply() != null && !loop.reply().isBlank()) {
            semanticCacheService.cacheResponseAsync(request.message(), loop.reply());
        }

        return new ChatResponse(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                loop.reply(),
                loop.totalLatencyMs(),
                loop.traces(),
                loop.execution());
    }

    public ChatResponse streamChat(
            UUID userId,
            ChatRequest request,
            Consumer<ChatStreamMeta> metaConsumer,
            Consumer<String> chunkConsumer,
            Consumer<ToolCall> clientToolConsumer) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved =
                modelRoutingService.resolve(request.provider(), request.model(), session);

        sessionService.saveMessage(
                session,
                "user",
                request.message(),
                null,
                resolved.provider().name(),
                resolved.model());
        int maxContextTokens = agentContextService.resolveContextTokenBudget(request.maxContextTokens(), session);
        metaConsumer.accept(
                new ChatStreamMeta(
                        session.getId(),
                        resolved.provider(),
                        resolved.model(),
                        List.of(),
                        "started",
                        initialExecutionDiagnostics(maxContextTokens)));

        Optional<String> cachedResponseOpt =
                semanticCacheService.findCachedResponse(request.message());
        if (cachedResponseOpt.isPresent()) {
            String cachedResponse = cachedResponseOpt.get();
            sessionService.saveMessage(
                    session,
                    "assistant",
                    cachedResponse,
                    null,
                    resolved.provider().name(),
                    resolved.model());
            if (chunkConsumer != null) {
                chunkConsumer.accept(cachedResponse);
            }
            AgentExecutionDiagnostics execution =
                    new AgentExecutionDiagnostics(
                            maxContextTokens, maxToolSteps(), 0, false, 0, "completed_from_cache");
            metaConsumer.accept(
                    new ChatStreamMeta(
                            session.getId(),
                            resolved.provider(),
                            resolved.model(),
                            List.of(),
                            "completed_from_cache",
                            execution));
            return new ChatResponse(
                    session.getId(),
                    resolved.provider(),
                    resolved.model(),
                    cachedResponse,
                    0,
                    List.of(),
                    execution);
        }

        java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>>
                clientToolInvoker =
                        (call) -> {
                            try {
                                java.util.concurrent.CompletableFuture<String> future =
                                        clientToolRegistry.register(userId.toString(), call.id());
                                if (clientToolConsumer != null) {
                                    clientToolConsumer.accept(call);
                                }
                                return future.orTimeout(
                                                appProperties.getAgent().getStreamTimeoutMs(),
                                                java.util.concurrent.TimeUnit.MILLISECONDS)
                                        .whenComplete(
                                                (res, ex) ->
                                                        clientToolRegistry.remove(
                                                                userId.toString(), call.id()));
                            } catch (Exception e) {
                                return java.util.concurrent.CompletableFuture.completedFuture(
                                        "ERROR: Client execution timed out or failed: "
                                                + e.getMessage());
                            }
                        };

        AgentLoopResult loop =
                executeLoop(
                        userId,
                        session,
                        resolved,
                        maxContextTokens,
                        chunkConsumer,
                        request.systemContext(),
                        request.customBaseUrl(),
                        request.customApiKey(),
                        clientToolInvoker);

        if (loop.reply() != null && !loop.reply().isBlank()) {
            semanticCacheService.cacheResponseAsync(request.message(), loop.reply());
        }

        metaConsumer.accept(
                new ChatStreamMeta(
                        session.getId(),
                        resolved.provider(),
                        resolved.model(),
                        loop.traces(),
                        "completed",
                        loop.execution()));
        return new ChatResponse(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                loop.reply(),
                loop.totalLatencyMs(),
                loop.traces(),
                loop.execution());
    }

    private AgentLoopResult executeLoop(
            UUID userId,
            ConversationSession session,
            ResolvedModelConfig resolved,
            int maxContextTokens,
            Consumer<String> chunkConsumer,
            String systemContext,
            String customBaseUrl,
            String customApiKey,
            java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>>
                    clientToolInvoker) {
        List<MessageResponse> history = sessionService.listMessages(userId, session.getId());
        int maxToolSteps = maxToolSteps();
        boolean stopOnToolError = appProperties.getAgent().isStopOnToolError();
        AgentContextService.HistoryWindow historyWindow =
                agentContextService.buildMessages(userId, history, maxContextTokens, systemContext);
        List<ModelChatMessage> messages = historyWindow.messages();
        List<ToolExecutionResult> traces = new ArrayList<>();
        StringBuilder replyBuilder = new StringBuilder();
        long startMs = System.currentTimeMillis();
        int toolRounds = 0;
        String stopReason = "completed";

        User user = Optional.ofNullable(userService.getUserById(userId)).orElse(null);
        AgentRuntime runtime =
                flexRuntimeFactory.createRuntime(user, resolved, toolOrchestrator.listToolSpecs(), customBaseUrl, customApiKey);

        // The last user message has already been saved by the caller and will be
        // sent separately via runtime.send() below — exclude it from injected history
        // to avoid duplicating it in the model's context window.
        String lastMessage = "";
        List<ModelChatMessage> historyForRuntime = new ArrayList<>(messages.size());
        for (int i = 0; i < messages.size(); i++) {
            ModelChatMessage msg = messages.get(i);
            boolean isLast = (i == messages.size() - 1);
            if (isLast && "user".equals(msg.role())) {
                lastMessage = msg.content();
            } else {
                historyForRuntime.add(msg);
            }
        }
        flexRuntimeFactory.injectHistory(runtime, session.getId().toString(), historyForRuntime);

        try {
            runtime.send(lastMessage);

            boolean running = true;
            while (running) {
                org.flexagent.core.model.Step step =
                        runtime.pollStep(100, java.util.concurrent.TimeUnit.MILLISECONDS);
                if (step == null) continue;

                if (step.status() == org.flexagent.core.model.StepStatus.ERROR) {
                    stopReason = "flexagent_error";
                    running = false;
                }

                if (step.type() == org.flexagent.core.model.StepType.TOOL_CALL
                        && !step.toolCalls().isEmpty()) {
                    toolRounds++;
                    if (toolRounds >= maxToolSteps) {
                        stopReason = "max_tool_steps_reached";
                        replyBuilder.append("\n[Stopped safely: reached max tool steps]");
                        running = false;
                        break;
                    }

                    List<CompletableFuture<ToolResult>> futures = new ArrayList<>();
                    List<org.flexagent.core.model.ToolCall> fcTools = step.toolCalls();
                    for (org.flexagent.core.model.ToolCall fcTool : fcTools) {
                        ToolCall localTool =
                                new ToolCall(fcTool.id(), fcTool.name(), fcTool.argumentsJson());
                        futures.add(toolOrchestrator.execute(localTool, clientToolInvoker));
                    }

                    // Wait for all tool calls to complete before sending results to runtime
                    CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

                    for (int i = 0; i < futures.size(); i++) {
                        ToolResult result = futures.get(i).join();
                        org.flexagent.core.model.ToolCall fcTool = fcTools.get(i);
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

                if (Boolean.TRUE.equals(step.isCompleteResponse())
                        && step.type() == org.flexagent.core.model.StepType.TEXT_RESPONSE) {
                    running = false;
                }
            }
        } catch (Exception e) {
            log.error("FlexAgent runtime error", e);
            stopReason = "exception";
            throw new RuntimeException("FlexAgent execution failed: " + e.getMessage(), e);
        }

        String reply = replyBuilder.toString();
        long totalLatencyMs = System.currentTimeMillis() - startMs;

        persistFinalAssistant(session, resolved, reply, traces);
        toolAuditService.saveAll(
                userId, session.getId(), resolved.provider().name(), resolved.model(), traces);
        AgentExecutionDiagnostics execution =
                new AgentExecutionDiagnostics(
                        maxContextTokens,
                        maxToolSteps,
                        historyWindow.historyMessagesUsed(),
                        historyWindow.historyTruncated(),
                        toolRounds,
                        stopReason);
        return new AgentLoopResult(reply, totalLatencyMs, traces, execution);
    }

    private AgentExecutionDiagnostics initialExecutionDiagnostics(int maxContextTokens) {
        return new AgentExecutionDiagnostics(
                maxContextTokens, maxToolSteps(), 0, false, 0, "started");
    }



    private void persistFinalAssistant(
            ConversationSession session,
            ResolvedModelConfig resolved,
            String reply,
            List<ToolExecutionResult> traces) {
        sessionService.saveMessage(
                session,
                "assistant",
                reply == null ? "" : reply,
                toJson(traces),
                resolved.provider().name(),
                resolved.model());
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
        return new ToolExecutionResult(
                result.toolName(),
                result.argsJson(),
                result.status(),
                result.durationMs(),
                result.output());
    }

    private int maxToolSteps() {
        return Math.max(1, appProperties.getAgent().getMaxToolSteps());
    }

    private record AgentLoopResult(
            String reply,
            long totalLatencyMs,
            List<ToolExecutionResult> traces,
            AgentExecutionDiagnostics execution) {}
}
