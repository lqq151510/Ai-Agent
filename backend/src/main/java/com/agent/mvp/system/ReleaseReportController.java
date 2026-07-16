package com.agent.mvp.system;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.system.dto.ReleaseReportResponse;
import com.agent.mvp.system.service.ReleaseReportService;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.context.annotation.Profile;

@RestController
@Profile("legacy")
@RequestMapping("/api/v1/system")
public class ReleaseReportController {

    private final ReleaseReportService releaseReportService;

    public ReleaseReportController(ReleaseReportService releaseReportService) {
        this.releaseReportService = releaseReportService;
    }

    @GetMapping("/release-report")
    public ReleaseReportResponse report(
            @RequestParam(defaultValue = "24") int windowHours,
            @RequestParam(required = false) UUID sessionId,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return releaseReportService.build(user.userId(), windowHours, sessionId);
        }
    }

    @GetMapping("/release-report/export")
    public ResponseEntity<?> exportReport(
            @RequestParam(defaultValue = "24") int windowHours,
            @RequestParam(required = false) UUID sessionId,
            @RequestParam(defaultValue = "markdown") String format,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            String normalized = format == null ? "markdown" : format.trim().toLowerCase();
            if ("json".equals(normalized)) {
                ReleaseReportResponse report =
                        releaseReportService.build(user.userId(), windowHours, sessionId);
                return ResponseEntity.ok()
                        .header(
                                HttpHeaders.CONTENT_DISPOSITION,
                                "attachment; filename=\"release-report.json\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(report);
            }

            String markdown =
                    releaseReportService.buildMarkdown(user.userId(), windowHours, sessionId);
            return ResponseEntity.ok()
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"release-report.md\"")
                    .contentType(MediaType.valueOf("text/markdown"))
                    .body(markdown);
        }
    }
}
