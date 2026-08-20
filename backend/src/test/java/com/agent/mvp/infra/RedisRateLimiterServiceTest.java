package com.agent.mvp.infra;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

class RedisRateLimiterServiceTest {

    @Test
    void shouldAllowWithinLimitAndRejectOverLimit() {
        StringRedisTemplate template = Mockito.mock(StringRedisTemplate.class);

        Mockito.when(
                        template.execute(
                                Mockito.<RedisScript<Long>>any(), any(), any()))
                .thenReturn(1L, 2L, 3L);

        RedisRateLimiterService service = new RedisRateLimiterService(template);

        assertTrue(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));
        assertTrue(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));
        assertFalse(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));

        Mockito.verify(template, Mockito.times(3))
                .execute(Mockito.<RedisScript<Long>>any(), any(), any());
    }
}
