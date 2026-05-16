package com.agent.mvp.config;

import com.agent.mvp.infra.CaffeineRateLimiterService;
import com.agent.mvp.infra.CaffeineSessionCacheService;
import com.agent.mvp.infra.RateLimiterService;
import com.agent.mvp.infra.SessionCacheService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.time.Duration;

@Configuration
@Profile("desktop")
public class DesktopCacheConfig {

    @Bean
    public Duration desktopRateLimiterIdleTtl(
            @Value("${app.desktop.cache.rate-limiter.idle-ttl-minutes:2}") long idleTtlMinutes
    ) {
        return Duration.ofMinutes(idleTtlMinutes);
    }

    @Bean
    public Duration desktopSessionCacheTtl(
            @Value("${app.desktop.cache.session.ttl-minutes:5}") long ttlMinutes
    ) {
        return Duration.ofMinutes(ttlMinutes);
    }

    @Bean
    public RateLimiterService rateLimiterService(
            Duration desktopRateLimiterIdleTtl,
            @Value("${app.desktop.cache.rate-limiter.max-keys:10000}") long maxKeys
    ) {
        return new CaffeineRateLimiterService(desktopRateLimiterIdleTtl, maxKeys);
    }

    @Bean
    public SessionCacheService sessionCacheService(
            Duration desktopSessionCacheTtl,
            @Value("${app.desktop.cache.session.max-sessions:1000}") long maxSessions
    ) {
        return new CaffeineSessionCacheService(desktopSessionCacheTtl, maxSessions);
    }
}
