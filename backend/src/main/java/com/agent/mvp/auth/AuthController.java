package com.agent.mvp.auth;

import com.agent.mvp.auth.dto.LoginRequest;
import com.agent.mvp.auth.dto.RefreshRequest;
import com.agent.mvp.auth.dto.LogoutRequest;
import com.agent.mvp.auth.dto.RegisterRequest;
import com.agent.mvp.auth.dto.TokenResponse;
import com.agent.mvp.auth.dto.UserProfileResponse;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.auth.service.AuthService;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.common.exception.UnauthorizedException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final RateLimiterService rateLimiterService;
    private final AppProperties appProperties;

    public AuthController(AuthService authService,
                          RateLimiterService rateLimiterService,
                          AppProperties appProperties) {
        this.authService = authService;
        this.rateLimiterService = rateLimiterService;
        this.appProperties = appProperties;
    }

    @PostMapping("/register")
    public UserProfileResponse register(@Valid @RequestBody RegisterRequest request, HttpServletRequest httpRequest) {
        String ip = resolveClientIp(httpRequest);
        long limit = Math.max(1, appProperties.getRateLimit().getRegisterPerMinute());
        boolean allowedByIp = rateLimiterService.allow("ratelimit:register:ip:" + ip, limit, Duration.ofMinutes(1));
        boolean allowedByEmail = rateLimiterService.allow(
                "ratelimit:register:email:" + request.email().toLowerCase().trim(),
                limit,
                Duration.ofMinutes(1)
        );
        if (!allowedByIp || !allowedByEmail) {
            throw new TooManyRequestsException("Too many register attempts");
        }
        return authService.register(request.email(), request.password());
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String ip = resolveClientIp(httpRequest);
        long limit = Math.max(1, appProperties.getRateLimit().getLoginPerMinute());
        boolean allowedByIp = rateLimiterService.allow("ratelimit:login:ip:" + ip, limit, Duration.ofMinutes(1));
        boolean allowedByEmail = rateLimiterService.allow(
                "ratelimit:login:email:" + request.email().toLowerCase().trim(),
                limit,
                Duration.ofMinutes(1)
        );
        if (!allowedByIp || !allowedByEmail) {
            throw new TooManyRequestsException("Too many login attempts");
        }

        return authService.login(request);
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request, HttpServletRequest httpRequest) {
        String ip = resolveClientIp(httpRequest);
        long limit = Math.max(1, appProperties.getRateLimit().getRefreshPerMinute());
        boolean allowedByIp = rateLimiterService.allow("ratelimit:refresh:ip:" + ip, limit, Duration.ofMinutes(1));
        if (!allowedByIp) {
            throw new TooManyRequestsException("Too many refresh attempts");
        }
        return authService.refresh(request.refreshToken());
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@Valid @RequestBody LogoutRequest request, HttpServletRequest httpRequest) {
        String authorization = httpRequest.getHeader(HttpHeaders.AUTHORIZATION);
        String accessToken = null;
        if (authorization != null && authorization.startsWith("Bearer ")) {
            accessToken = authorization.substring(7);
        }
        authService.logout(accessToken, request.refreshToken());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/me")
    public UserProfileResponse me(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return authService.me(user);
        }
    }

    @PostMapping("/config")
    public UserProfileResponse updateConfig(@RequestBody com.agent.mvp.auth.dto.UpdateUserConfigRequest configRequest, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            return authService.updateConfig(user, configRequest);
        }
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private AuthenticatedUser requireAuthenticatedUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new UnauthorizedException("Authentication required");
        }
        return principal;
    }
}
