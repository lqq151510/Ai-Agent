package com.agent.mvp.infra;

import com.agent.mvp.session.dto.MessageResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SessionCacheService {

    Optional<List<MessageResponse>> getCachedMessages(UUID sessionId);

    void cacheMessages(UUID sessionId, List<MessageResponse> messages);

    void evictMessages(UUID sessionId);
}
