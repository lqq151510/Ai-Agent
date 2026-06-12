package com.agent.mvp.infra;

import java.time.Duration;
import java.util.Collections;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

@Service
@Profile("!desktop")
public class RedisRateLimiterService implements RateLimiterService {

    private final StringRedisTemplate redisTemplate;
    private final RedisScript<Long> rateLimitScript;

    public RedisRateLimiterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
        String luaScript =
                "local count = redis.call('INCR', KEYS[1])\n"
                        + "if count == 1 then\n"
                        + "  redis.call('PEXPIRE', KEYS[1], ARGV[1])\n"
                        + "end\n"
                        + "return count";
        this.rateLimitScript = new DefaultRedisScript<>(luaScript, Long.class);
    }

    @Override
    public boolean allow(String key, long limit, Duration window) {
        Long count =
                redisTemplate.execute(
                        rateLimitScript,
                        Collections.singletonList(key),
                        String.valueOf(window.toMillis()));

        if (count == null) {
            return false;
        }

        return count <= limit;
    }
}
