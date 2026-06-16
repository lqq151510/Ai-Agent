package com.agent.mvp.coach;

import com.agent.mvp.coach.dto.SentinelReportRequest;
import com.agent.mvp.coach.service.SentinelAlertBroadcaster;
import com.agent.mvp.coach.service.CoachService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sentinel")
public class SentinelController {

    private final CoachService coachService;
    private final SentinelAlertBroadcaster sentinelAlertBroadcaster;

    public SentinelController(CoachService coachService, SentinelAlertBroadcaster sentinelAlertBroadcaster) {
        this.coachService = coachService;
        this.sentinelAlertBroadcaster = sentinelAlertBroadcaster;
    }

    @PostMapping("/report")
    public ResponseEntity<Void> report(@RequestBody SentinelReportRequest request) {
        coachService.handleSentinelReport(request);
        return ResponseEntity.ok().build();
    }

    @GetMapping(value = "/alerts", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter alerts() {
        return sentinelAlertBroadcaster.subscribe();
    }
}
