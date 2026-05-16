package com.agent.mvp.infra;

import com.agent.mvp.session.dto.MessageResponse;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CaffeineSessionCacheServiceTest {

    @Test
    void shouldCacheAndEvictMessages() {
        CaffeineSessionCacheService service = new CaffeineSessionCacheService(Duration.ofMinutes(1), 100);
        UUID sessionId = UUID.randomUUID();
        List<MessageResponse> messages = List.of(new MessageResponse(
                UUID.randomUUID(),
                "user",
                "hello",
                null,
                "OPENAI",
                "qwen/qwen3.5-9b",
                Instant.now()
        ));

        service.cacheMessages(sessionId, messages);
        assertTrue(service.getCachedMessages(sessionId).isPresent());
        assertEquals(1, service.getCachedMessages(sessionId).orElseThrow().size());

        service.evictMessages(sessionId);
        assertTrue(service.getCachedMessages(sessionId).isEmpty());
    }
}
