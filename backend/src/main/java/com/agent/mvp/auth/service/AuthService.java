package com.agent.mvp.auth.service;

import com.agent.mvp.auth.dto.LoginRequest;
import com.agent.mvp.auth.dto.TokenResponse;
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

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public UserProfileResponse register(String email, String password) {
        String normalizedEmail = email.toLowerCase().trim();
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new BadRequestException("Email already exists");
        }

        User user = new User();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        User saved = userRepository.save(user);

        return new UserProfileResponse(saved.getId(), saved.getEmail(), saved.getCreatedAt());
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
        return new UserProfileResponse(user.getId(), user.getEmail(), user.getCreatedAt());
    }
}
