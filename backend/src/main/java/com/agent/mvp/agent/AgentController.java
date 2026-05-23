package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.common.exception.UnauthorizedException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RateLimiterService;
import jakarta.annotation.PreDestroy;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
@RequestMapping("/api/v1/agent")
public class AgentController {
    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private static final Duration CHAT_RATE_LIMIT_WINDOW = Duration.ofMinutes(1);

    private final AgentService agentService;
    private final RateLimiterService rateLimiterService;
    private final AppProperties appProperties;
    private final AtomicInteger streamThreadCounter = new AtomicInteger();
    private final AtomicInteger inFlightStreams = new AtomicInteger();
    private final AtomicInteger rejectedStreams = new AtomicInteger();
    private final ThreadPoolExecutor streamExecutor;
    private final ScheduledExecutorService heartbeatExecutor;

    public AgentController(AgentService agentService,
                           RateLimiterService rateLimiterService,
                           AppProperties appProperties,
                           MeterRegistry meterRegistry) {
        this.agentService = agentService;
        this.rateLimiterService = rateLimiterService;
        this.appProperties = appProperties;
        int corePoolSize = Math.max(1, appProperties.getAgent().getStreamExecutorCorePoolSize());
        int maxPoolSize = Math.max(corePoolSize, appProperties.getAgent().getStreamExecutorMaxPoolSize());
        int queueCapacity = Math.max(1, appProperties.getAgent().getStreamExecutorQueueCapacity());
        int heartbeatThreads = Math.max(1, appProperties.getAgent().getHeartbeatThreads());
        this.streamExecutor = new ThreadPoolExecutor(
                corePoolSize,
                maxPoolSize,
                60,
                TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(queueCapacity),
                runnable -> {
                    Thread thread = new Thread(runnable, "agent-stream-" + streamThreadCounter.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                }
        );
        this.heartbeatExecutor = Executors.newScheduledThreadPool(
                heartbeatThreads,
                runnable -> {
                    Thread thread = new Thread(runnable, "agent-heartbeat");
                    thread.setDaemon(true);
                    return thread;
                }
        );
        Gauge.builder("agent.stream.executor.active", streamExecutor, ThreadPoolExecutor::getActiveCount)
                .register(meterRegistry);
        Gauge.builder("agent.stream.executor.queue.size", streamExecutor, executor -> executor.getQueue().size())
                .register(meterRegistry);
        Gauge.builder("agent.stream.executor.pool.size", streamExecutor, ThreadPoolExecutor::getPoolSize)
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

    @PostMapping(value = "/chat/stream", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody ChatRequest request,
                             Authentication authentication) {
        return openStream(request, authentication);
    }

    @PreDestroy
    public void shutdownStreamExecutor() {
        streamExecutor.shutdown();
        heartbeatExecutor.shutdown();
        awaitTermination(streamExecutor, "streamExecutor");
        awaitTermination(heartbeatExecutor, "heartbeatExecutor");
    }

    private SseEmitter openStream(ChatRequest request, Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        MDC.put(RequestContext.USER_ID_KEY, user.userId().toString());
        MDC.put(RequestContext.SESSION_ID_KEY, request.sessionId().toString());
        enforceChatRateLimit(user);
        SseEmitter emitter = new SseEmitter(Math.max(30_000L, appProperties.getAgent().getStreamTimeoutMs()));
        AtomicBoolean done = new AtomicBoolean(false);
        Duration heartbeatInterval = Duration.ofMillis(Math.max(1_000L, appProperties.getAgent().getHeartbeatIntervalMs()));
        ScheduledFuture<?> heartbeat = heartbeatExecutor.scheduleAtFixedRate(
                () -> sendHeartbeat(emitter, done),
                heartbeatInterval.toMillis(),
                heartbeatInterval.toMillis(),
                TimeUnit.MILLISECONDS
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
            inFlightStreams.incrementAndGet();
            streamExecutor.execute(() -> runStream(user, request, emitter, done, heartbeat));
        } catch (RejectedExecutionException ex) {
            done.set(true);
            heartbeat.cancel(true);
            rejectedStreams.incrementAndGet();
            inFlightStreams.decrementAndGet();
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
            inFlightStreams.decrementAndGet();
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
        } catch (Exception ex) {
            log.warn("Failed to send heartbeat event", ex);
        }
    }

    private void awaitTermination(java.util.concurrent.ExecutorService executor, String executorName) {
        try {
            if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                log.warn("{} did not terminate within timeout", executorName);
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn("{} termination interrupted", executorName, ex);
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
