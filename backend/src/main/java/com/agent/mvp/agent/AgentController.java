package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.common.exception.UnauthorizedException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RedisRateLimiterService;
import jakarta.annotation.PreDestroy;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;

@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private static final long STREAM_TIMEOUT_MS = 300_000L;
    private static final Duration CHAT_RATE_LIMIT_WINDOW = Duration.ofMinutes(1);
    private static final Duration HEARTBEAT_INTERVAL = Duration.ofSeconds(10);

    private final AgentService agentService;
    private final RedisRateLimiterService rateLimiterService;
    private final AppProperties appProperties;
    private final AtomicInteger streamThreadCounter = new AtomicInteger();
    private final ThreadPoolExecutor streamExecutor = new ThreadPoolExecutor(
            4,
            16,
            60,
            TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(64),
            runnable -> {
                Thread thread = new Thread(runnable, "agent-stream-" + streamThreadCounter.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            }
    );
    private final ScheduledExecutorService heartbeatExecutor = Executors.newScheduledThreadPool(
            2,
            runnable -> {
                Thread thread = new Thread(runnable, "agent-heartbeat");
                thread.setDaemon(true);
                return thread;
            }
    );

    public AgentController(AgentService agentService,
                           RedisRateLimiterService rateLimiterService,
                           AppProperties appProperties,
                           MeterRegistry meterRegistry) {
        this.agentService = agentService;
        this.rateLimiterService = rateLimiterService;
        this.appProperties = appProperties;
        Gauge.builder("agent.stream.executor.active", streamExecutor, ThreadPoolExecutor::getActiveCount)
                .register(meterRegistry);
        Gauge.builder("agent.stream.executor.queue.size", streamExecutor, executor -> executor.getQueue().size())
                .register(meterRegistry);
        Gauge.builder("agent.stream.executor.pool.size", streamExecutor, ThreadPoolExecutor::getPoolSize)
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

    @PostMapping(value = "/chat/stream", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody ChatRequest request,
                             Authentication authentication) {
        return openStream(request, authentication);
    }

    @PreDestroy
    public void shutdownStreamExecutor() {
        streamExecutor.shutdown();
        heartbeatExecutor.shutdown();
    }

    private SseEmitter openStream(ChatRequest request, Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        MDC.put(RequestContext.USER_ID_KEY, user.userId().toString());
        MDC.put(RequestContext.SESSION_ID_KEY, request.sessionId().toString());
        enforceChatRateLimit(user);
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        AtomicBoolean done = new AtomicBoolean(false);
        ScheduledFuture<?> heartbeat = heartbeatExecutor.scheduleAtFixedRate(
                () -> sendHeartbeat(emitter, done),
                HEARTBEAT_INTERVAL.toSeconds(),
                HEARTBEAT_INTERVAL.toSeconds(),
                TimeUnit.SECONDS
        );
        emitter.onCompletion(() -> {
            done.set(true);
            heartbeat.cancel(true);
        });
        emitter.onTimeout(() -> {
            done.set(true);
            heartbeat.cancel(true);
        });
        emitter.onError(error -> {
            done.set(true);
            heartbeat.cancel(true);
        });

        try {
            streamExecutor.execute(() -> runStream(user, request, emitter, done, heartbeat));
        } catch (RejectedExecutionException ex) {
            done.set(true);
            heartbeat.cancel(true);
            throw new TooManyRequestsException("Too many concurrent stream requests");
        } finally {
            MDC.remove(RequestContext.USER_ID_KEY);
            MDC.remove(RequestContext.SESSION_ID_KEY);
        }

        return emitter;
    }

    private void runStream(AuthenticatedUser user,
                           ChatRequest request,
                           SseEmitter emitter,
                           AtomicBoolean done,
                           ScheduledFuture<?> heartbeat) {
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
             MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, request.sessionId().toString())) {
        try {
            ChatResponse response = agentService.streamChat(
                    user.userId(),
                    request,
                    meta -> sendEvent(emitter, "meta", meta),
                    chunk -> sendEvent(emitter, "chunk", chunk)
            );
            sendEvent(emitter, "done", response);
            emitter.complete();
        } catch (Exception ex) {
            if (isClientDisconnect(ex)) {
                emitter.complete();
                return;
            }
            try {
                sendEvent(emitter, "error", Map.of("message", errorMessage(ex)));
                emitter.complete();
            } catch (Exception sendError) {
                emitter.complete();
            }
        }
        } finally {
            done.set(true);
            heartbeat.cancel(true);
        }
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

    private void sendHeartbeat(SseEmitter emitter, AtomicBoolean done) {
        if (done.get()) {
            return;
        }
        try {
            sendEvent(emitter, "heartbeat", Map.of("ts", Instant.now().toString()));
        } catch (Exception ignored) {
            // best effort heartbeat
        }
    }

    private void sendEvent(SseEmitter emitter, String name, Object data) {
        try {
            synchronized (emitter) {
                emitter.send(SseEmitter.event().name(name).data(data));
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to write stream event", ex);
        }
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
