package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ClientToolResultRequest;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.agent.tooling.ClientToolRegistry;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RateLimiterService;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {
    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private static final Duration CHAT_RATE_LIMIT_WINDOW = Duration.ofMinutes(1);

    private final AgentService agentService;
    private final RateLimiterService rateLimiterService;
    private final AppProperties appProperties;
    private final ClientToolRegistry clientToolRegistry;
    private final AtomicInteger inFlightStreams = new AtomicInteger();
    private final AtomicInteger rejectedStreams = new AtomicInteger();
    private final ThreadPoolTaskExecutor streamExecutor;
    private final ThreadPoolTaskScheduler heartbeatScheduler;

    public AgentController(
            AgentService agentService,
            RateLimiterService rateLimiterService,
            AppProperties appProperties,
            ClientToolRegistry clientToolRegistry,
            ThreadPoolTaskExecutor streamExecutor,
            ThreadPoolTaskScheduler heartbeatScheduler,
            MeterRegistry meterRegistry) {
        this.agentService = agentService;
        this.rateLimiterService = rateLimiterService;
        this.appProperties = appProperties;
        this.clientToolRegistry = clientToolRegistry;
        this.streamExecutor = streamExecutor;
        this.heartbeatScheduler = heartbeatScheduler;
        Gauge.builder(
                        "agent.stream.executor.active",
                        streamExecutor,
                        ThreadPoolTaskExecutor::getActiveCount)
                .register(meterRegistry);
        Gauge.builder(
                        "agent.stream.executor.queue.size",
                        streamExecutor,
                        ThreadPoolTaskExecutor::getQueueSize)
                .register(meterRegistry);
        Gauge.builder(
                        "agent.stream.executor.pool.size",
                        streamExecutor,
                        ThreadPoolTaskExecutor::getPoolSize)
                .register(meterRegistry);
        Gauge.builder("agent.stream.inflight", inFlightStreams, AtomicInteger::get)
                .register(meterRegistry);
        Gauge.builder("agent.stream.rejected.total", rejectedStreams, AtomicInteger::get)
                .register(meterRegistry);
    }

    @PostMapping("/chat")
    public ChatResponse chat(
            @Valid @RequestBody ChatRequest request, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                        MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
                MDC.MDCCloseable s =
                        MDC.putCloseable(
                                RequestContext.SESSION_ID_KEY, request.sessionId().toString())) {
            enforceChatRateLimit(user);

            return agentService.chat(user.userId(), request);
        }
    }

    @PostMapping("/chat/tool_result")
    public ResponseEntity<Void> submitToolResult(
            @Valid @RequestBody ClientToolResultRequest request, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        clientToolRegistry.complete(user.userId().toString(), request.callId(), request.result());
        return ResponseEntity.ok().build();
    }

    @PostMapping(
            value = "/chat/stream",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(
            @Valid @RequestBody ChatRequest request, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        enforceChatRateLimit(user);

        SseEmitter emitter = new SseEmitter(300_000L);

        long heartbeatMs = Math.max(1_000L, appProperties.getAgent().getHeartbeatIntervalMs());
        AtomicBoolean cleanedUp = new AtomicBoolean(false);
        AtomicReference<ScheduledFuture<?>> heartbeatRef = new AtomicReference<>();
        Runnable cleanup =
                () -> {
                    if (!cleanedUp.compareAndSet(false, true)) return;
                    ScheduledFuture<?> heartbeat = heartbeatRef.get();
                    if (heartbeat != null) {
                        heartbeat.cancel(true);
                    }
                };
        ScheduledFuture<?> heartbeat =
                heartbeatScheduler
                        .getScheduledExecutor()
                        .scheduleAtFixedRate(
                                () -> {
                                    try {
                                        emitter.send(
                                                SseEmitter.event()
                                                        .name("heartbeat")
                                                        .data(
                                                                Map.of(
                                                                        "ts",
                                                                        Instant.now().toString())));
                                    } catch (Exception e) {
                                        cleanup.run();
                                    }
                                },
                                heartbeatMs,
                                heartbeatMs,
                                TimeUnit.MILLISECONDS);

        heartbeatRef.set(heartbeat);
        emitter.onCompletion(cleanup);
        emitter.onError(e -> cleanup.run());
        emitter.onTimeout(cleanup);

        try {
            inFlightStreams.incrementAndGet();
            streamExecutor.execute(
                    () -> {
                        try (MDC.MDCCloseable u =
                                        MDC.putCloseable(
                                                RequestContext.USER_ID_KEY,
                                                user.userId().toString());
                                MDC.MDCCloseable s =
                                        MDC.putCloseable(
                                                RequestContext.SESSION_ID_KEY,
                                                request.sessionId().toString())) {
                            try {
                                ChatResponse response =
                                        agentService.streamChat(
                                                user.userId(),
                                                request,
                                                meta -> sendSseEvent(emitter, "meta", meta),
                                                chunk -> sendSseEvent(emitter, "chunk", chunk),
                                                call ->
                                                        sendSseEvent(
                                                                emitter, "client_tool_call", call));
                                sendSseEvent(emitter, "done", response);
                                emitter.complete();
                            } catch (Exception ex) {
                                if (!isClientDisconnect(ex)) {
                                    try {
                                        sendSseEvent(
                                                emitter,
                                                "error",
                                                Map.of("message", errorMessage(ex)));
                                    } catch (Exception ignore) {
                                    }
                                }
                                emitter.completeWithError(ex);
                            }
                        } finally {
                            inFlightStreams.decrementAndGet();
                            cleanup.run();
                        }
                    });
        } catch (RejectedExecutionException ex) {
            cleanup.run();
            rejectedStreams.incrementAndGet();
            inFlightStreams.decrementAndGet();
            throw new TooManyRequestsException("Too many concurrent stream requests");
        }

        return emitter;
    }

    private void sendSseEvent(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void enforceChatRateLimit(AuthenticatedUser user) {
        long standardLimit = Math.max(1, appProperties.getRateLimit().getChatPerMinute());
        long premiumLimit =
                Math.max(standardLimit, appProperties.getRateLimit().getChatPremiumPerMinute());
        long limit = isPremium(user.email()) ? premiumLimit : standardLimit;
        boolean allowed =
                rateLimiterService.allow(
                        "ratelimit:chat:" + user.userId(), limit, CHAT_RATE_LIMIT_WINDOW);
        if (!allowed) {
            throw new TooManyRequestsException("Too many requests");
        }
    }

    private boolean isPremium(String email) {
        if (email == null || email.isBlank()) {
            return false;
        }
        return appProperties.getRateLimit().getPremiumEmailSuffixes().stream()
                .filter(suffix -> suffix != null && !suffix.isBlank())
                .anyMatch(email::endsWith);
    }

    private String errorMessage(Exception ex) {
        return ex.getMessage() == null || ex.getMessage().isBlank()
                ? "Stream failed"
                : ex.getMessage();
    }

    private boolean isClientDisconnect(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof IOException) {
                return true;
            }
            String message = current.getMessage();
            if (message != null && message.toLowerCase().contains("broken pipe")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
