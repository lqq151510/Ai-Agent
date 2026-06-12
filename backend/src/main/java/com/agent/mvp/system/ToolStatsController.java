package com.agent.mvp.system;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.tooling.dto.ToolStatsResponse;
import com.agent.mvp.tooling.service.ToolAuditService;
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

@RestController
@RequestMapping("/api/v1/system")
public class ToolStatsController {

    private final ToolAuditService toolAuditService;

    public ToolStatsController(ToolAuditService toolAuditService) {
        this.toolAuditService = toolAuditService;
    }

    @GetMapping("/tool-stats")
    public ToolStatsResponse stats(
            @RequestParam(defaultValue = "24") int windowHours,
            @RequestParam(required = false) UUID sessionId,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return toolAuditService.stats(user.userId(), windowHours, sessionId);
        }
    }

    @GetMapping("/tool-stats/export")
    public ResponseEntity<?> exportStats(
            @RequestParam(defaultValue = "24") int windowHours,
            @RequestParam(required = false) UUID sessionId,
            @RequestParam(defaultValue = "json") String format,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u =
                MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            String normalizedFormat = format == null ? "json" : format.trim().toLowerCase();
            if ("markdown".equals(normalizedFormat) || "md".equals(normalizedFormat)) {
                String markdown =
                        toolAuditService.statsMarkdown(user.userId(), windowHours, sessionId);
                return ResponseEntity.ok()
                        .header(
                                HttpHeaders.CONTENT_DISPOSITION,
                                "attachment; filename=\"tool-stats.md\"")
                        .contentType(MediaType.valueOf("text/markdown"))
                        .body(markdown);
            }

            ToolStatsResponse stats = toolAuditService.stats(user.userId(), windowHours, sessionId);
            return ResponseEntity.ok()
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"tool-stats.json\"")
                    .body(stats);
        }
    }
}
