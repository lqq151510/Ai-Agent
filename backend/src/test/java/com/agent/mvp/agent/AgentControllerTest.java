package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RedisRateLimiterService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class AgentControllerTest {

    @Test
    void shouldReturnRateLimitExceptionWhenChatLimitExceeded() {
        AgentService agentService = Mockito.mock(AgentService.class);
        RedisRateLimiterService rateLimiter = Mockito.mock(RedisRateLimiterService.class);
        AppProperties appProperties = new AppProperties();
        UUID userId = UUID.randomUUID();
        AgentController controller = new AgentController(
                agentService,
                rateLimiter,
                appProperties,
                new SimpleMeterRegistry()
        );

        Mockito.when(rateLimiter.allow(eq("ratelimit:chat:" + userId), eq(60L), any(Duration.class)))
                .thenReturn(false);

        var auth = new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId, "user@example.com"),
                null,
                List.of()
        );

        assertThrows(TooManyRequestsException.class, () ->
                controller.chat(new ChatRequest(UUID.randomUUID(), "hello", null, null), auth)
        );
    }

    @Test
    void shouldRespectConfiguredPremiumChatLimit() {
        AgentService agentService = Mockito.mock(AgentService.class);
        RedisRateLimiterService rateLimiter = Mockito.mock(RedisRateLimiterService.class);
        AppProperties appProperties = new AppProperties();
        appProperties.getRateLimit().setPremiumEmailSuffixes(List.of("@vip.example.com"));
        appProperties.getRateLimit().setChatPerMinute(60);
        appProperties.getRateLimit().setChatPremiumPerMinute(150);
        UUID userId = UUID.randomUUID();
        AgentController controller = new AgentController(
                agentService,
                rateLimiter,
                appProperties,
                new SimpleMeterRegistry()
        );

        Mockito.when(rateLimiter.allow(eq("ratelimit:chat:" + userId), eq(150L), any(Duration.class)))
                .thenReturn(false);

        var auth = new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId, "user@vip.example.com"),
                null,
                List.of()
        );

        TooManyRequestsException ex = assertThrows(TooManyRequestsException.class, () ->
                controller.chat(new ChatRequest(UUID.randomUUID(), "hello", null, null), auth)
        );

        assertEquals("Too many requests", ex.getMessage());
    }
}
