package com.agent.mvp.coach.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.agent.mvp.coach.dto.SentinelAlertResponse;
import java.util.UUID;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SentinelAlertBroadcasterTest {
    @Test
    void isolatesUsersAndKeepsConnectionLimit() throws Exception {
        SentinelAlertBroadcaster broadcaster = new SentinelAlertBroadcaster();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        for (int i = 0; i < 5; i++) broadcaster.subscribe(a);
        SseEmitter rejected = broadcaster.subscribe(a);
        assertNotNull(rejected);
        assertEquals(5, emitters(broadcaster).get(a).size());
        broadcaster.publish(a, new SentinelAlertResponse("A", "fix"));
        broadcaster.publish(b, new SentinelAlertResponse("B", "fix"));
        assertEquals(new SentinelAlertResponse("A", "fix"), alerts(broadcaster).get(a));
        assertEquals(new SentinelAlertResponse("B", "fix"), alerts(broadcaster).get(b));
    }

    @Test
    void publishSendsOnlyToTheMatchingUser() throws Exception {
        SentinelAlertBroadcaster broadcaster = new SentinelAlertBroadcaster();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        SseEmitter aEmitter = mock(SseEmitter.class);
        SseEmitter bEmitter = mock(SseEmitter.class);
        emitters(broadcaster).put(a, new CopyOnWriteArrayList<>(java.util.List.of(aEmitter)));
        emitters(broadcaster).put(b, new CopyOnWriteArrayList<>(java.util.List.of(bEmitter)));

        broadcaster.publish(a, new SentinelAlertResponse("A", "fix"));

        verify(aEmitter).send(org.mockito.ArgumentMatchers.any(SseEmitter.SseEventBuilder.class));
        verify(bEmitter, never()).send(org.mockito.ArgumentMatchers.any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void cleanupRemovesOnlyTheCorrespondingUser() throws Exception {
        SentinelAlertBroadcaster broadcaster = new SentinelAlertBroadcaster();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        SseEmitter firstA = broadcaster.subscribe(a);
        broadcaster.subscribe(b);
        firstA.complete();
        broadcaster.publish(a, new SentinelAlertResponse("A", "fix"));
        assertEquals(0, emitters(broadcaster).getOrDefault(a, new CopyOnWriteArrayList<>()).size());
        firstA.complete();
        assertEquals(0, emitters(broadcaster).getOrDefault(a, new CopyOnWriteArrayList<>()).size());
        assertEquals(1, emitters(broadcaster).get(b).size());
    }

    @SuppressWarnings("unchecked")
    private Map<UUID, CopyOnWriteArrayList<SseEmitter>> emitters(SentinelAlertBroadcaster broadcaster)
            throws Exception {
        Field field = SentinelAlertBroadcaster.class.getDeclaredField("emitters");
        field.setAccessible(true);
        return (Map<UUID, CopyOnWriteArrayList<SseEmitter>>) field.get(broadcaster);
    }

    @SuppressWarnings("unchecked")
    private Map<UUID, SentinelAlertResponse> alerts(SentinelAlertBroadcaster broadcaster)
            throws Exception {
        Field field = SentinelAlertBroadcaster.class.getDeclaredField("lastAlerts");
        field.setAccessible(true);
        return (Map<UUID, SentinelAlertResponse>) field.get(broadcaster);
    }
}
