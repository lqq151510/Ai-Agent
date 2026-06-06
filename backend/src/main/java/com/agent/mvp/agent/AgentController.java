package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ClientToolResultRequest;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.agent.tooling.ClientToolRegistry;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.common.exception.UnauthorizedException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RateLimiterService;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;

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

    public AgentController(AgentService agentService,
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
        Gauge.builder("agent.stream.executor.active", streamExecutor, ThreadPoolTaskExecutor::getActiveCount)
                .register(meterRegistry);
        Gauge.builder("agent.stream.executor.queue.size", streamExecutor, ThreadPoolTaskExecutor::getQueueSize)
                .register(meterRegistry);
        Gauge.builder("agent.stream.executor.pool.size", streamExecutor, ThreadPoolTaskExecutor::getPoolSize)
                .register(meterRegistry);
        Gauge.builder("agent.stream.inflight", inFlightStreams, AtomicInteger::get)
                .register(meterRegistry);
        Gauge.builder("agent.stream.rejected.total", rejectedStreams, AtomicInteger::get)
                .register(meterRegistry);
    }

    @PostMapping("/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request,
                             Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
             MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, request.sessionId().toString())) {
            enforceChatRateLimit(user);

            return agentService.chat(user.userId(), request);
        }
    }

    @PostMapping("/chat/tool_result")
    public ResponseEntity<Void> submitToolResult(@Valid @RequestBody ClientToolResultRequest request,
                                                 Authentication authentication) {
        requireUser(authentication);
        clientToolRegistry.complete(request.callId(), request.result());
        return ResponseEntity.ok().build();
    }

    @PostMapping(value = "/chat/stream", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Object>> stream(@Valid @RequestBody ChatRequest request,
                                                Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        enforceChatRateLimit(user);

        return Flux.create(sink -> {
            AtomicBoolean done = new AtomicBoolean(false);
            Duration heartbeatInterval = Duration.ofMillis(Math.max(1_000L, appProperties.getAgent().getHeartbeatIntervalMs()));
            ScheduledFuture<?> heartbeat = heartbeatScheduler.getScheduledExecutor().scheduleAtFixedRate(
                    () -> {
                        if (!done.get()) {
                            sink.next(ServerSentEvent.builder()
                                    .event("heartbeat")
                                    .data(Map.of("ts", Instant.now().toString()))
                                    .build());
                        }
                    },
                    heartbeatInterval.toMillis(),
                    heartbeatInterval.toMillis(),
                    TimeUnit.MILLISECONDS
            );

            sink.onDispose(() -> {
                done.set(true);
                heartbeat.cancel(true);
            });

            try {
                inFlightStreams.incrementAndGet();
                streamExecutor.execute(() -> {
                    try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
                         MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, request.sessionId().toString())) {
                        try {
                            ChatResponse response = agentService.streamChat(
                                    user.userId(),
                                    request,
                                    meta -> sink.next(ServerSentEvent.builder().event("meta").data(meta).build()),
                                    chunk -> sink.next(ServerSentEvent.builder().event("chunk").data(chunk).build()),
                                    call -> sink.next(ServerSentEvent.builder().event("client_tool_call").data(call).build())
                            );
                            sink.next(ServerSentEvent.builder().event("done").data(response).build());
                            sink.complete();
                        } catch (Exception ex) {
                            if (isClientDisconnect(ex)) {
                                sink.complete();
                                return;
                            }
                            try {
                                sink.next(ServerSentEvent.builder()
                                        .event("error")
                                        .data(Map.of("message", errorMessage(ex)))
                                        .build());
                                sink.complete();
                            } catch (Exception sendError) {
                                sink.complete();
                            }
                        }
                    } finally {
                        done.set(true);
                        heartbeat.cancel(true);
                        inFlightStreams.decrementAndGet();
                    }
                });
            } catch (RejectedExecutionException ex) {
                done.set(true);
                heartbeat.cancel(true);
                rejectedStreams.incrementAndGet();
                inFlightStreams.decrementAndGet();
                sink.error(new TooManyRequestsException("Too many concurrent stream requests"));
            }
        });
    }

    private void enforceChatRateLimit(AuthenticatedUser user) {
        long standardLimit = Math.max(1, appProperties.getRateLimit().getChatPerMinute());
        long premiumLimit = Math.max(standardLimit, appProperties.getRateLimit().getChatPremiumPerMinute());
        long limit = isPremium(user.email()) ? premiumLimit : standardLimit;
        boolean allowed = rateLimiterService.allow("ratelimit:chat:" + user.userId(), limit, CHAT_RATE_LIMIT_WINDOW);
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

    private AuthenticatedUser requireUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new UnauthorizedException("Authentication required");
        }
        return principal;
    }
}
