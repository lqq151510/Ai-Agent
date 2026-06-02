package com.agent.mvp.session;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.dto.PageResult;
import com.agent.mvp.common.exception.UnauthorizedException;
import com.agent.mvp.session.dto.CreateSessionRequest;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.dto.SessionExportResponse;
import com.agent.mvp.session.dto.SessionResponse;
import com.agent.mvp.session.dto.UpdateSessionContextTokenLimitRequest;
import com.agent.mvp.session.service.SessionService;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sessions")
public class SessionController {

    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @PostMapping
    public SessionResponse createSession(@Valid @RequestBody CreateSessionRequest request,
                                         Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return sessionService.createSession(user.userId(), request);
        }
    }

    @GetMapping
    public PageResult<SessionResponse> listSessions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return sessionService.listSessions(user.userId(), page, size);
        }
    }

    @GetMapping("/{sessionId}/messages")
    public List<MessageResponse> listMessages(@PathVariable UUID sessionId,
                                              Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
             MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, sessionId.toString())) {
            return sessionService.listMessages(user.userId(), sessionId);
        }
    }

    @PatchMapping("/{sessionId}/context-token-limit")
    public SessionResponse updateContextTokenLimit(@PathVariable UUID sessionId,
                                                   @Valid @RequestBody UpdateSessionContextTokenLimitRequest request,
                                                   Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
             MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, sessionId.toString())) {
            return sessionService.updateContextTokenLimit(user.userId(), sessionId, request.contextTokenLimit());
        }
    }

    @GetMapping("/{sessionId}/export")
    public ResponseEntity<?> exportSession(@PathVariable UUID sessionId,
                                           @RequestParam(defaultValue = "json") String format,
                                           Authentication authentication) {
        AuthenticatedUser user = requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
             MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, sessionId.toString())) {
            String normalized = format == null ? "json" : format.trim().toLowerCase();
            if ("markdown".equals(normalized) || "md".equals(normalized)) {
                String markdown = sessionService.exportSessionMarkdown(user.userId(), sessionId);
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"session-" + sessionId + ".md\"")
                        .contentType(MediaType.valueOf("text/markdown"))
                        .body(markdown);
            }

            SessionExportResponse exported = sessionService.exportSession(user.userId(), sessionId);
            return ResponseEntity.ok(exported);
        }
    }

    private AuthenticatedUser requireUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new UnauthorizedException("Authentication required");
        }
        return principal;
    }
}
