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
        private final long windowNanos;
        private final AtomicLong count;
        private volatile long windowStart;

        RateLimitBucket(Duration window) {
            this.windowNanos = window.toNanos();
            this.count = new AtomicLong(0);
            this.windowStart = System.nanoTime();
        }

        boolean allow(long limit) {
            synchronized (this) {
                long now = System.nanoTime();
                // Subtraction handles nanoTime overflow correctly
                if (now - windowStart >= windowNanos || now - windowStart < 0) {
                    windowStart = now;
                    count.set(0);
                }
                long current = count.incrementAndGet();
                return current <= limit;
            }
        }
    }
}
