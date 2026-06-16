package com.agent.mvp.coach.service;

import com.agent.mvp.coach.dto.SentinelAlertResponse;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class SentinelAlertBroadcaster {
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final AtomicReference<SentinelAlertResponse> lastAlert = new AtomicReference<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));

        SentinelAlertResponse current = lastAlert.get();
        if (current != null) {
            send(emitter, current);
        }

        return emitter;
    }

    public void publish(SentinelAlertResponse alert) {
        lastAlert.set(alert);
        for (SseEmitter emitter : emitters) {
            send(emitter, alert);
        }
    }

    private void send(SseEmitter emitter, SentinelAlertResponse alert) {
        try {
            emitter.send(SseEmitter.event().name("alert").data(alert));
        } catch (Exception ex) {
            emitters.remove(emitter);
            try {
                emitter.completeWithError(ex);
            } catch (Exception ignore) {
                // ignore
            }
        }
    }
}
