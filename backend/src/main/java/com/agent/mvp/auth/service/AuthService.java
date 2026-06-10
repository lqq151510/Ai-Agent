package com.agent.mvp.auth.service;

import com.agent.mvp.auth.dto.LoginRequest;
import com.agent.mvp.auth.dto.TokenResponse;
import com.agent.mvp.auth.dto.UpdateUserConfigRequest;
import com.agent.mvp.auth.dto.UserProfileResponse;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.repo.UserRepository;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.common.exception.UnauthorizedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final int MIN_PASSWORD_LENGTH = 8;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final com.agent.mvp.infra.TokenBlacklistService tokenBlacklistService;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       com.agent.mvp.infra.TokenBlacklistService tokenBlacklistService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenBlacklistService = tokenBlacklistService;
    }

    public void logout(String accessToken, String refreshToken) {
        if (accessToken != null && !accessToken.isBlank()) {
            try {
                io.jsonwebtoken.Claims claims = jwtService.parseToken(accessToken).getBody();
                java.util.Date expiration = claims.getExpiration();
                long diffSeconds = (expiration.getTime() - System.currentTimeMillis()) / 1000;
                if (diffSeconds > 0) {
                    tokenBlacklistService.blacklistToken(accessToken, java.time.Duration.ofSeconds(diffSeconds));
                }
            } catch (Exception ignored) {
            }
        }
        if (refreshToken != null && !refreshToken.isBlank()) {
            try {
                io.jsonwebtoken.Claims claims = jwtService.parseToken(refreshToken).getBody();
                java.util.Date expiration = claims.getExpiration();
                long diffSeconds = (expiration.getTime() - System.currentTimeMillis()) / 1000;
                if (diffSeconds > 0) {
                    tokenBlacklistService.blacklistToken(refreshToken, java.time.Duration.ofSeconds(diffSeconds));
                }
            } catch (Exception ignored) {
            }
        }
    }

    @Transactional
    public UserProfileResponse register(String email, String password) {
        String normalizedEmail = email.toLowerCase().trim();
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new BadRequestException("Email already exists");
        }
        validatePasswordStrength(password);

        User user = new User();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        User saved = userRepository.save(user);

        return toProfileResponse(saved);
    }

    private void validatePasswordStrength(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new BadRequestException("Password must be at least 8 characters long");
        }
        boolean hasUpper = false;
        boolean hasLower = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) {
                hasUpper = true;
            } else if (Character.isLowerCase(c)) {
                hasLower = true;
            } else if (Character.isDigit(c)) {
                hasDigit = true;
            } else if (!Character.isWhitespace(c)) {
                hasSpecial = true;
            }
        }
        if (!(hasUpper && hasLower && hasDigit && hasSpecial)) {
            throw new BadRequestException("Password must include upper/lowercase letters, digits and special characters");
        }
    }

    public TokenResponse login(LoginRequest request) {
        String normalizedEmail = request.email().toLowerCase().trim();
        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        JwtService.TokenPair pair = jwtService.issueTokens(user);
        return new TokenResponse(pair.accessToken(), pair.refreshToken(), pair.accessTokenExpiresInSeconds());
    }

    @Transactional
    public TokenResponse refresh(String refreshToken) {
        if (!jwtService.isRefreshToken(refreshToken)) {
            throw new UnauthorizedException("Refresh token required");
        }

        User user = userRepository.findById(jwtService.extractUserId(refreshToken))
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        int tokenVersion = jwtService.extractTokenVersion(refreshToken);
        if (tokenVersion != user.getTokenVersion()) {
            throw new UnauthorizedException("Refresh token has been rotated");
        }

        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);

        JwtService.TokenPair pair = jwtService.issueTokens(user);
        return new TokenResponse(pair.accessToken(), pair.refreshToken(), pair.accessTokenExpiresInSeconds());
    }

    public UserProfileResponse me(AuthenticatedUser authenticatedUser) {
        User user = userRepository.findById(authenticatedUser.userId())
                .orElseThrow(() -> new NotFoundException("User not found"));
        return toProfileResponse(user);
    }

    @Transactional
    public UserProfileResponse updateConfig(AuthenticatedUser authenticatedUser, UpdateUserConfigRequest configRequest) {
        User user = userRepository.findById(authenticatedUser.userId())
                .orElseThrow(() -> new NotFoundException("User not found"));
        
        user.setCustomBaseUrl(configRequest.customBaseUrl());
        user.setCustomApiKey(configRequest.customApiKey());
        userRepository.save(user);

        return toProfileResponse(user);
    }

    private UserProfileResponse toProfileResponse(User user) {
        String maskedKey = null;
        if (user.getCustomApiKey() != null && !user.getCustomApiKey().isBlank()) {
            if (user.getCustomApiKey().length() > 6) {
                maskedKey = user.getCustomApiKey().substring(0, 3) + "***" + user.getCustomApiKey().substring(user.getCustomApiKey().length() - 3);
            } else {
                maskedKey = "***";
            }
        }
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getCreatedAt(),
                user.getCustomBaseUrl(),
                maskedKey
        );
    }
}
