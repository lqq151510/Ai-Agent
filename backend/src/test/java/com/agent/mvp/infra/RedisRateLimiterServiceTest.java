package com.agent.mvp.infra;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class RedisRateLimiterServiceTest {

    @Test
    void shouldAllowWithinLimitAndRejectOverLimit() {
        StringRedisTemplate template = Mockito.mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = Mockito.mock(ValueOperations.class);

        Mockito.when(template.opsForValue()).thenReturn(valueOperations);
        Mockito.when(valueOperations.increment("ratelimit:key")).thenReturn(1L, 2L, 3L);

        RedisRateLimiterService service = new RedisRateLimiterService(template);

        assertTrue(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));
        assertTrue(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));
        assertFalse(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));

        Mockito.verify(template).expire(eq("ratelimit:key"), any(Duration.class));
    }
}
