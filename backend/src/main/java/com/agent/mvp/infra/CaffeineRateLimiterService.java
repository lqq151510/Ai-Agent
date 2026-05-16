package com.agent.mvp.infra;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

public class CaffeineRateLimiterService implements RateLimiterService {

    private final Cache<String, RateLimitBucket> buckets;

    public CaffeineRateLimiterService(Duration expireAfterAccess, long maximumSize) {
        this.buckets = Caffeine.newBuilder()
                .expireAfterAccess(expireAfterAccess)
                .maximumSize(maximumSize)
                .recordStats()
                .build();
    }

    @Override
    public boolean allow(String key, long limit, Duration window) {
        RateLimitBucket bucket = buckets.get(key, k -> new RateLimitBucket(window));
        return bucket.allow(limit);
    }

    private static class RateLimitBucket {
        private final long windowMs;
        private final AtomicLong count;
        private volatile long windowStart;

        RateLimitBucket(Duration window) {
            this.windowMs = window.toMillis();
            this.count = new AtomicLong(0);
            this.windowStart = System.currentTimeMillis();
        }

        boolean allow(long limit) {
            long now = System.currentTimeMillis();
            if (now - windowStart >= windowMs) {
                synchronized (this) {
                    if (now - windowStart >= windowMs) {
                        windowStart = now;
                        count.set(0);
                    }
                }
            }
            long current = count.incrementAndGet();
            return current <= limit;
        }
    }
}
