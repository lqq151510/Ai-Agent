package com.agent.mvp.coach.service;

import com.agent.mvp.coach.dto.SentinelAlertResponse;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class SentinelAlertBroadcaster {
    private static final int MAX_EMITTERS_PER_USER = 5;
    private final Map<UUID, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();
    private final Map<UUID, SentinelAlertResponse> lastAlerts = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID userId) {
        SseEmitter emitter = new SseEmitter(0L);
        CopyOnWriteArrayList<SseEmitter> userEmitters =
                emitters.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>());
        synchronized (userEmitters) {
            if (userEmitters.size() >= MAX_EMITTERS_PER_USER) {
                if (userEmitters.isEmpty()) {
                    emitters.remove(userId, userEmitters);
                }
                emitter.completeWithError(
                        new IllegalStateException("Too many alert subscriptions"));
                return emitter;
            }
            userEmitters.add(emitter);
        }
        Runnable cleanup = () -> remove(userId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(error -> cleanup.run());

        SentinelAlertResponse current = lastAlerts.get(userId);
        if (current != null) {
            send(userId, emitter, current);
        }

        return emitter;
    }

    public void publish(UUID userId, SentinelAlertResponse alert) {
        lastAlerts.put(userId, alert);
        for (SseEmitter emitter : emitters.getOrDefault(userId, new CopyOnWriteArrayList<>())) {
            send(userId, emitter, alert);
        }
    }

    private void remove(UUID userId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> userEmitters = emitters.get(userId);
        if (userEmitters != null) {
            userEmitters.remove(emitter);
            if (userEmitters.isEmpty()) emitters.remove(userId, userEmitters);
        }
    }

    private void send(UUID userId, SseEmitter emitter, SentinelAlertResponse alert) {
        try {
            emitter.send(SseEmitter.event().name("alert").data(alert));
        } catch (Exception ex) {
            remove(userId, emitter);
            try {
                emitter.completeWithError(ex);
            } catch (Exception ignore) {
                // ignore
            }
        }
    }
}
