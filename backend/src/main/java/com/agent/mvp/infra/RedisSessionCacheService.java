package com.agent.mvp.infra;

import com.agent.mvp.session.dto.MessageResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@Profile("!desktop")
public class RedisSessionCacheService implements SessionCacheService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public RedisSessionCacheService(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public Optional<List<MessageResponse>> getCachedMessages(UUID sessionId) {
        String raw = redisTemplate.opsForValue().get(cacheKey(sessionId));
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }

        try {
            JavaType listType =
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(List.class, MessageResponse.class);
            return Optional.of(objectMapper.readValue(raw, listType));
        } catch (JsonProcessingException e) {
            redisTemplate.delete(cacheKey(sessionId));
            return Optional.empty();
        }
    }

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(RedisSessionCacheService.class);

    public void cacheMessages(UUID sessionId, List<MessageResponse> messages) {
        try {
            String payload = objectMapper.writeValueAsString(messages);
            redisTemplate.opsForValue().set(cacheKey(sessionId), payload, CACHE_TTL);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize session messages for cache, sessionId={}", sessionId, e);
        }
    }

    public void evictMessages(UUID sessionId) {
        redisTemplate.delete(cacheKey(sessionId));
    }

    private String cacheKey(UUID sessionId) {
        return "session:messages:" + sessionId;
    }
}
