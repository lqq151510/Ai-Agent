package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.AgentExecutionDiagnostics;
import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ChatStreamMeta;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ClientToolRegistry;
import com.agent.mvp.agent.tooling.ToolCall;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.UserService;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.config.MetricsSupport;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.dto.ToolExecutionResult;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
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
    private final MeterRegistry meterRegistry;
    private final MessageHistoryProcessor messageHistoryProcessor;
    private final ToolCallManager toolCallManager;

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
            AgentContextService agentContextService,
            MeterRegistry meterRegistry,
            MessageHistoryProcessor messageHistoryProcessor,
            ToolCallManager toolCallManager) {
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
        this.meterRegistry = meterRegistry;
        this.messageHistoryProcessor = messageHistoryProcessor;
        this.toolCallManager = toolCallManager;
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved =
                modelRoutingService.resolve(request.provider(), request.model(), session);
        // 指标埋点：请求计数 + 耗时计时
        MetricsSupport.chatRequests(meterRegistry, resolved.provider(), resolved.model())
                .increment();
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            return doChat(userId, request, session, resolved);
        } catch (RuntimeException ex) {
            MetricsSupport.chatErrors(meterRegistry, resolved.provider(), resolved.model())
                    .increment();
            throw ex;
        } finally {
            sample.stop(MetricsSupport.chatDuration(meterRegistry, resolved.provider()));
        }
    }

    private ChatResponse doChat(
            UUID userId, ChatRequest request, ConversationSession session, ResolvedModelConfig resolved) {
        sessionService.saveMessage(
                session,
                "user",
                request.message(),
                null,
                resolved.provider().name(),
                resolved.model());
        int maxContextTokens = agentContextService.resolveContextTokenBudget(request.maxContextTokens(), session);

        Optional<String> cachedResponseOpt;
        try {
            cachedResponseOpt = semanticCacheService.findCachedResponse(request.message());
        } catch (Exception ex) {
            log.warn("Semantic cache lookup failed, continuing without cache", ex);
            cachedResponseOpt = Optional.empty();
        }
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
                        request.clientTools(),
                        rejectClientTool);

        if (loop.reply() != null && !loop.reply().isBlank()) {
            try {
                semanticCacheService.cacheResponseAsync(request.message(), loop.reply());
            } catch (Exception ex) {
                log.warn("Semantic cache write failed, ignoring", ex);
            }
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
        // 指标埋点：请求计数 + 耗时计时
        MetricsSupport.chatRequests(meterRegistry, resolved.provider(), resolved.model())
                .increment();
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            return doStreamChat(
                    userId,
                    request,
                    session,
                    resolved,
                    metaConsumer,
                    chunkConsumer,
                    clientToolConsumer);
        } catch (RuntimeException ex) {
            MetricsSupport.chatErrors(meterRegistry, resolved.provider(), resolved.model())
                    .increment();
            throw ex;
        } finally {
            sample.stop(MetricsSupport.chatDuration(meterRegistry, resolved.provider()));
        }
    }

    private ChatResponse doStreamChat(
            UUID userId,
            ChatRequest request,
            ConversationSession session,
            ResolvedModelConfig resolved,
            Consumer<ChatStreamMeta> metaConsumer,
            Consumer<String> chunkConsumer,
            Consumer<ToolCall> clientToolConsumer) {
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

        Optional<String> cachedResponseOpt;
        try {
            cachedResponseOpt = semanticCacheService.findCachedResponse(request.message());
        } catch (Exception ex) {
            log.warn("Semantic cache lookup failed, continuing without cache", ex);
            cachedResponseOpt = Optional.empty();
        }
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
                            String userKey = userId.toString();
                            String callId = call.id();
                            try {
                                java.util.concurrent.CompletableFuture<String> future =
                                        clientToolRegistry.register(userKey, callId);
                                if (clientToolConsumer != null) {
                                    clientToolConsumer.accept(call);
                                }
                                return future.orTimeout(
                                                appProperties.getAgent().getStreamTimeoutMs(),
                                                java.util.concurrent.TimeUnit.MILLISECONDS)
                                        .whenComplete(
                                                (res, ex) ->
                                                        clientToolRegistry.remove(userKey, callId));
                            } catch (Exception e) {
                                clientToolRegistry.remove(userKey, callId);
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
                        request.clientTools(),
                        clientToolInvoker);

        if (loop.reply() != null && !loop.reply().isBlank()) {
            try {
                semanticCacheService.cacheResponseAsync(request.message(), loop.reply());
            } catch (Exception ex) {
                log.warn("Semantic cache write failed, ignoring", ex);
            }
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
            List<com.agent.mvp.agent.tooling.ToolSpec> clientTools,
            java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>>
                    clientToolInvoker) {
        // 处理消息历史：获取历史、构建上下文窗口、分离最后一条用户消息
        MessageHistoryProcessor.ProcessedHistory processedHistory =
                messageHistoryProcessor.processHistory(
                        userId, session.getId(), maxContextTokens, systemContext);

        // 创建运行时环境并注入历史
        User user = Optional.ofNullable(userService.getUserById(userId)).orElse(null);
        
        List<com.agent.mvp.agent.tooling.ToolSpec> allTools = new ArrayList<>(toolOrchestrator.listToolSpecs());
        if (clientTools != null) {
            allTools.addAll(clientTools);
        }

        AgentRuntime runtime =
                flexRuntimeFactory.createRuntime(
                        user,
                        resolved,
                        allTools,
                        customBaseUrl,
                        customApiKey);
        flexRuntimeFactory.injectHistory(
                runtime, session.getId().toString(), processedHistory.historyForRuntime());

        // 执行主循环
        return executeMainLoop(
                runtime,
                processedHistory.lastMessage(),
                chunkConsumer,
                clientToolInvoker,
                userId,
                session,
                resolved,
                maxContextTokens,
                processedHistory.historyWindow());
    }

    private AgentLoopResult executeMainLoop(
            AgentRuntime runtime,
            String lastMessage,
            Consumer<String> chunkConsumer,
            java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>>
                    clientToolInvoker,
            UUID userId,
            ConversationSession session,
            ResolvedModelConfig resolved,
            int maxContextTokens,
            AgentContextService.HistoryWindow historyWindow) {
        int maxToolSteps = maxToolSteps();
        boolean stopOnToolError = appProperties.getAgent().isStopOnToolError();
        List<ToolExecutionResult> traces = new ArrayList<>();
        StringBuilder replyBuilder = new StringBuilder();
        long startMs = System.currentTimeMillis();
        int toolRounds = 0;
        String stopReason = "completed";

        try {
            runtime.send(lastMessage);

            boolean running = true;
            while (running) {
                org.flexagent.core.model.Step step =
                        runtime.pollStep(100, java.util.concurrent.TimeUnit.MILLISECONDS);
                if (step == null) continue;

                // 处理错误状态
                if (step.status() == org.flexagent.core.model.StepStatus.ERROR) {
                    stopReason = "flexagent_error";
                    running = false;
                    continue;
                }

                // 处理工具调用
                if (step.type() == org.flexagent.core.model.StepType.TOOL_CALL
                        && !step.toolCalls().isEmpty()) {
                    toolRounds++;
                    if (toolRounds >= maxToolSteps) {
                        stopReason = "max_tool_steps_reached";
                        replyBuilder.append("\n[Stopped safely: reached max tool steps]");
                        running = false;
                        break;
                    }

                    ToolCallManager.ToolCallResult toolResult;
                    try {
                        toolResult =
                                toolCallManager.executeToolCalls(
                                        step.toolCalls(),
                                        clientToolInvoker,
                                        runtime,
                                        stopOnToolError);
                    } catch (Exception ex) {
                        log.error("Tool call execution failed", ex);
                        toolResult =
                                new ToolCallManager.ToolCallResult(
                                        List.of(
                                                new com.agent.mvp.tooling.dto.ToolExecutionResult(
                                                        "tool_batch",
                                                        "{}",
                                                        "ERROR",
                                                        0,
                                                        "Tool execution failed: "
                                                                + ex.getMessage())),
                                        true);
                    }
                    traces.addAll(toolResult.traces());

                    if (toolResult.hasError()) {
                        stopReason = "tool_error";
                        replyBuilder.append("\n[Stopped safely: tool error]");
                        running = false;
                        break;
                    }
                }

                // 处理流式响应
                if (step.contentDelta() != null && !step.contentDelta().isEmpty()) {
                    replyBuilder.append(step.contentDelta());
                    if (chunkConsumer != null) {
                        chunkConsumer.accept(step.contentDelta());
                    }
                }

                // 检查是否完成
                if (Boolean.TRUE.equals(step.isCompleteResponse())
                        && step.type() == org.flexagent.core.model.StepType.TEXT_RESPONSE) {
                    running = false;
                }
            }
        } catch (Exception e) {
            log.error("FlexAgent runtime error", e);
            stopReason = "exception";
            String partialReply = replyBuilder.toString();
            persistFinalAssistant(session, resolved, partialReply, traces);
            toolAuditService.saveAll(
                    userId, session.getId(), resolved.provider().name(), resolved.model(), traces);
            throw new RuntimeException("FlexAgent execution failed: " + e.getMessage(), e);
        }

        // 构建结果
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

    private int maxToolSteps() {
        return Math.max(1, appProperties.getAgent().getMaxToolSteps());
    }

    private record AgentLoopResult(
            String reply,
            long totalLatencyMs,
            List<ToolExecutionResult> traces,
            AgentExecutionDiagnostics execution) {}
}
