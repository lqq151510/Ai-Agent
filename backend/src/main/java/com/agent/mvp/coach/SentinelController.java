package com.agent.mvp.coach;

import com.agent.mvp.coach.dto.SentinelReportRequest;
import com.agent.mvp.coach.service.CoachService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sentinel")
public class SentinelController {

    private final CoachService coachService;

    public SentinelController(CoachService coachService) {
        this.coachService = coachService;
    }

    @PostMapping("/report")
    public ResponseEntity<Void> report(@RequestBody SentinelReportRequest request) {
        coachService.handleSentinelReport(request);
        return ResponseEntity.ok().build();
    }
}
