package com.agent.mvp.coach;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.coach.dto.CoachRunResponse;
import com.agent.mvp.coach.dto.LogDiagnosisRequest;
import com.agent.mvp.coach.dto.LogDiagnosisResponse;
import com.agent.mvp.coach.dto.RequirementBreakdownRequest;
import com.agent.mvp.coach.dto.RequirementBreakdownResponse;
import com.agent.mvp.coach.dto.ScaffoldRequest;
import com.agent.mvp.coach.dto.ScaffoldResponse;
import com.agent.mvp.coach.service.CoachService;
import com.agent.mvp.common.context.RequestContext;
import com.agent.sentinel.SentinelWebhook;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/coach", "/api/v1/coach"})
public class CoachController {

    private final CoachService coachService;

    public CoachController(CoachService coachService) {
        this.coachService = coachService;
    }

    @PostMapping("/requirements/breakdown")
    public RequirementBreakdownResponse breakdown(
            @Valid @RequestBody RequirementBreakdownRequest request,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return coachService.breakdown(user.userId(), request);
        }
    }

    @PostMapping("/execute-multi-agent")
    @SentinelWebhook(tag = "coach.multi-agent")
    public ResponseEntity<String> executeMultiAgent(
            @RequestBody String requirement,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            String result = coachService.executeMultiAgentTask(user.userId(), requirement);
            return ResponseEntity.ok(result);
        }
    }

    @PostMapping("/logs/diagnose")
    public LogDiagnosisResponse diagnose(
            @Valid @RequestBody LogDiagnosisRequest request, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return coachService.diagnose(user.userId(), request);
        }
    }

    @PostMapping("/scaffolds")
    public ScaffoldResponse scaffold(
            @Valid @RequestBody ScaffoldRequest request, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return coachService.generateScaffold(user.userId(), request);
        }
    }

    @GetMapping("/scaffolds/{runId}/download")
    public ResponseEntity<InputStreamResource> downloadScaffold(
            @PathVariable UUID runId, Authentication authentication) throws IOException {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            Path artifact = coachService.findScaffoldArtifact(user.userId(), runId);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(Files.size(artifact))
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + artifact.getFileName() + "\"")
                    .body(new InputStreamResource(Files.newInputStream(artifact)));
        }
    }

    @GetMapping("/runs")
    public List<CoachRunResponse> runs(
            @RequestParam(defaultValue = "20") int limit, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return coachService.listRuns(user.userId(), limit);
        }
    }
}
