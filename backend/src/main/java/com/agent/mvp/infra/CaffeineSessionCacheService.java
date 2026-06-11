package com.agent.mvp.infra;

import com.agent.mvp.session.dto.MessageResponse;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class CaffeineSessionCacheService implements SessionCacheService {

    private final Cache<UUID, List<MessageResponse>> cache;

    public CaffeineSessionCacheService(Duration cacheTtl, long maximumSize) {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(cacheTtl)
                .maximumSize(maximumSize)
                .recordStats()
                .build();
    }

    @Override
    public Optional<List<MessageResponse>> getCachedMessages(UUID sessionId) {
        return Optional.ofNullable(cache.getIfPresent(sessionId)).map(List::copyOf);
    }

    @Override
    public void cacheMessages(UUID sessionId, List<MessageResponse> messages) {
        if (messages != null) {
            cache.put(sessionId, List.copyOf(messages));
        }
    }

    @Override
    public void evictMessages(UUID sessionId) {
        cache.invalidate(sessionId);
    }
}
