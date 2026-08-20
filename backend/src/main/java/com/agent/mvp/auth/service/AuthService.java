package com.agent.mvp.auth.service;

import com.agent.mvp.auth.dto.LoginRequest;
import com.agent.mvp.auth.dto.TokenResponse;
import com.agent.mvp.auth.dto.UpdateUserConfigRequest;
import com.agent.mvp.auth.dto.UserProfileResponse;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.common.exception.UnauthorizedException;
import io.jsonwebtoken.Claims;
import java.time.Duration;
import java.util.Date;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final com.agent.mvp.infra.TokenBlacklistService tokenBlacklistService;

    public AuthService(
            UserService userService,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            com.agent.mvp.infra.TokenBlacklistService tokenBlacklistService) {
        this.userService = userService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenBlacklistService = tokenBlacklistService;
    }

    public void logout(String accessToken, String refreshToken) {
        blacklistIfValid(accessToken);
        blacklistIfValid(refreshToken);
    }

    private void blacklistIfValid(String token) {
        if (token != null && !token.isBlank()) {
            try {
                Claims claims = jwtService.parseToken(token).getPayload();
                Date expiration = claims.getExpiration();
                long diffSeconds = (expiration.getTime() - System.currentTimeMillis()) / 1000;
                if (diffSeconds > 0) {
                    tokenBlacklistService.blacklistToken(token, Duration.ofSeconds(diffSeconds));
                }
            } catch (Exception ex) {
                log.warn("Logout token parse failed", ex);
                throw new UnauthorizedException("Invalid token during logout");
            }
        }
    }

    @Transactional
    public UserProfileResponse register(String email, String password) {
        String normalizedEmail = email.toLowerCase().trim();
        if (userService.existsByEmail(normalizedEmail)) {
            throw new BadRequestException("Email already exists");
        }

        User user = new User();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        User saved = userService.createUser(user);

        return toProfileResponse(saved);
    }

    public TokenResponse login(LoginRequest request) {
        String normalizedEmail = request.email().toLowerCase().trim();
        User user =
                Optional.ofNullable(userService.getUserByEmail(normalizedEmail))
                        .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        JwtService.TokenPair pair = jwtService.issueTokens(user);
        return new TokenResponse(
                pair.accessToken(), pair.refreshToken(), pair.accessTokenExpiresInSeconds());
    }

    @Transactional
    public TokenResponse refresh(String refreshToken) {
        if (!jwtService.isRefreshToken(refreshToken)) {
            throw new UnauthorizedException("Refresh token required");
        }

        if (tokenBlacklistService.isBlacklisted(refreshToken)) {
            throw new UnauthorizedException("Refresh token has been revoked or already used");
        }

        User user =
                Optional.ofNullable(userService.getUserById(jwtService.extractUserId(refreshToken)))
                        .orElseThrow(() -> new UnauthorizedException("User not found"));

        int tokenVersion = jwtService.extractTokenVersion(refreshToken);
        if (tokenVersion != user.getTokenVersion()) {
            throw new UnauthorizedException("Refresh token has been rotated");
        }

        user.setTokenVersion(user.getTokenVersion() + 1);
        if (user.getId() == null) {
            userService.createUser(user);
        } else {
            userService.updateUser(user);
        }

        blacklistIfValid(refreshToken);

        JwtService.TokenPair pair = jwtService.issueTokens(user);
        return new TokenResponse(
                pair.accessToken(), pair.refreshToken(), pair.accessTokenExpiresInSeconds());
    }

    public UserProfileResponse me(AuthenticatedUser authenticatedUser) {
        User user =
                Optional.ofNullable(userService.getUserById(authenticatedUser.userId()))
                        .orElseThrow(() -> new NotFoundException("User not found"));
        return toProfileResponse(user);
    }

    @Transactional
    public UserProfileResponse updateConfig(
            AuthenticatedUser authenticatedUser, UpdateUserConfigRequest configRequest) {
        User user =
                Optional.ofNullable(userService.getUserById(authenticatedUser.userId()))
                        .orElseThrow(() -> new NotFoundException("User not found"));

        user.setCustomBaseUrl(configRequest.customBaseUrl());
        user.setCustomApiKey(configRequest.customApiKey());
        if (user.getId() == null) {
            userService.createUser(user);
        } else {
            userService.updateUser(user);
        }

        return toProfileResponse(user);
    }

    private UserProfileResponse toProfileResponse(User user) {
        String maskedKey = null;
        if (user.getCustomApiKey() != null && !user.getCustomApiKey().isBlank()) {
            if (user.getCustomApiKey().length() > 6) {
                maskedKey =
                        user.getCustomApiKey().substring(0, 3)
                                + "***"
                                + user.getCustomApiKey()
                                        .substring(user.getCustomApiKey().length() - 3);
            } else {
                maskedKey = "***";
            }
        }
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getCreatedAt(),
                user.getCustomBaseUrl(),
                maskedKey);
    }
}
