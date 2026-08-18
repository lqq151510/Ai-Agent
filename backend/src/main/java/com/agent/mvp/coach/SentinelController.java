package com.agent.mvp.coach;

import com.agent.mvp.auth.security.AuthUtils;
import com.agent.mvp.coach.dto.SentinelReportRequest;
import com.agent.mvp.coach.service.CoachService;
import com.agent.mvp.coach.service.SentinelAlertBroadcaster;
import com.agent.mvp.common.exception.ApiException;
import com.agent.mvp.infra.RateLimiterService;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.concurrent.RejectedExecutionException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/sentinel")
public class SentinelController {

    private final CoachService coachService;
    private final SentinelAlertBroadcaster sentinelAlertBroadcaster;
    private final RateLimiterService rateLimiterService;
    private final ThreadPoolTaskExecutor sentinelExecutor;

    public SentinelController(
            CoachService coachService,
            SentinelAlertBroadcaster sentinelAlertBroadcaster,
            RateLimiterService rateLimiterService,
            @Qualifier("sentinelExecutor") ThreadPoolTaskExecutor sentinelExecutor) {
        this.coachService = coachService;
        this.sentinelAlertBroadcaster = sentinelAlertBroadcaster;
        this.rateLimiterService = rateLimiterService;
        this.sentinelExecutor = sentinelExecutor;
    }

    @PostMapping("/report")
    public ResponseEntity<Void> report(
            @Valid @RequestBody SentinelReportRequest request, Authentication authentication) {
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SentinelServicePrincipal principal)
                || principal.ownerUserId() == null) {
            throw new ApiException("UNAUTHORIZED", "Sentinel service authentication required");
        }
        if (!rateLimiterService.allow(
                "sentinel:" + principal.source(), 10, Duration.ofMinutes(1))) {
            throw new ApiException("TOO_MANY_REQUESTS", "Sentinel report rate limit exceeded");
        }
        try {
            sentinelExecutor.execute(
                    () -> coachService.handleSentinelReport(request, principal.ownerUserId()));
        } catch (RejectedExecutionException ex) {
            throw new ApiException("TOO_MANY_REQUESTS", "Sentinel report queue is full");
        }
        return ResponseEntity.accepted().build();
    }

    @GetMapping(value = "/alerts", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter alerts(Authentication authentication) {
        return sentinelAlertBroadcaster.subscribe(AuthUtils.requireUser(authentication).userId());
    }
}
