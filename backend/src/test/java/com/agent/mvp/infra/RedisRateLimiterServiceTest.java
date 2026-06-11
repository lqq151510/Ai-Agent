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
        
        Mockito.when(template.execute(any(org.springframework.data.redis.core.script.RedisScript.class), any(), any()))
               .thenReturn(1L, 2L, 3L);

        RedisRateLimiterService service = new RedisRateLimiterService(template);

        assertTrue(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));
        assertTrue(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));
        assertFalse(service.allow("ratelimit:key", 2, Duration.ofMinutes(1)));

        Mockito.verify(template, Mockito.times(3)).execute(any(org.springframework.data.redis.core.script.RedisScript.class), any(), any());
    }
}
