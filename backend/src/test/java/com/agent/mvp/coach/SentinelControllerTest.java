package com.agent.mvp.coach;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.agent.mvp.coach.dto.SentinelReportRequest;
import com.agent.mvp.coach.service.CoachService;
import com.agent.mvp.coach.service.SentinelAlertBroadcaster;
import com.agent.mvp.infra.RateLimiterService;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class SentinelControllerTest {

    @Test
    void rateLimitKeyUsesAuthenticatedSourceInsteadOfProjectName() {
        CoachService coachService = mock(CoachService.class);
        RateLimiterService rateLimiter = mock(RateLimiterService.class);
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        UUID owner = UUID.randomUUID();
        org.mockito.Mockito.when(
                        rateLimiter.allow(
                                eq("sentinel:github-actions"), eq(10L), eq(Duration.ofMinutes(1))))
                .thenReturn(true);
        org.mockito.Mockito.when(
                        rateLimiter.allow(
                                eq("sentinel:gitlab"), eq(10L), eq(Duration.ofMinutes(1))))
                .thenReturn(true);

        SentinelController controller =
                new SentinelController(
                        coachService, mock(SentinelAlertBroadcaster.class), rateLimiter, executor);
        controller.report(
                new SentinelReportRequest("attacker-controlled-project", "stack trace"),
                new UsernamePasswordAuthenticationToken(
                        new SentinelServicePrincipal(owner, "github-actions"), null));
        controller.report(
                new SentinelReportRequest("attacker-controlled-project", "stack trace"),
                new UsernamePasswordAuthenticationToken(
                        new SentinelServicePrincipal(owner, "gitlab"), null));

        verify(rateLimiter)
                .allow(eq("sentinel:github-actions"), eq(10L), eq(Duration.ofMinutes(1)));
        verify(rateLimiter).allow(eq("sentinel:gitlab"), eq(10L), eq(Duration.ofMinutes(1)));
    }
}
