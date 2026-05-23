package com.agent.mvp.infra;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;

public class CaffeineTokenBlacklistService implements TokenBlacklistService {

    private record BlacklistEntry(long expireTimeMs) {}

    private final Cache<String, BlacklistEntry> cache;

    public CaffeineTokenBlacklistService(long maximumSize) {
        this.cache = Caffeine.newBuilder()
                .maximumSize(maximumSize)
                .build();
    }

    @Override
    public void blacklistToken(String token, Duration ttl) {
        long expireTime = System.currentTimeMillis() + ttl.toMillis();
        cache.put(token, new BlacklistEntry(expireTime));
    }

    @Override
    public boolean isBlacklisted(String token) {
        BlacklistEntry entry = cache.getIfPresent(token);
        if (entry == null) {
            return false;
        }
        if (System.currentTimeMillis() > entry.expireTimeMs()) {
            cache.invalidate(token);
            return false;
        }
        return true;
    }
}
