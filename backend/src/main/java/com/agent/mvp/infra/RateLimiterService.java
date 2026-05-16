package com.agent.mvp.infra;

import java.time.Duration;

public interface RateLimiterService {

    boolean allow(String key, long limit, Duration window);
}
