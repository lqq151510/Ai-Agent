package com.agent.mvp.infra;

import java.time.Duration;

public interface TokenBlacklistService {
    void blacklistToken(String token, Duration ttl);

    boolean isBlacklisted(String token);
}
