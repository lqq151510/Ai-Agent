package com.agent.mvp.infra;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class RedisRateLimiterService {

    private final StringRedisTemplate redisTemplate;

    public RedisRateLimiterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public boolean allow(String key, long limit, Duration window) {
        Long count = redisTemplate.opsForValue().increment(key);
        if (count == null) {
            return false;
        }

        if (count == 1) {
            redisTemplate.expire(key, window);
        }

        return count <= limit;
    }
}
