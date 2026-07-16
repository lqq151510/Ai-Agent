package com.agent.mvp.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.agent.mvp.auth.dto.LoginRequest;
import com.agent.mvp.auth.dto.TokenResponse;
import com.agent.mvp.auth.dto.UpdateUserConfigRequest;
import com.agent.mvp.auth.dto.UserProfileResponse;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.common.exception.UnauthorizedException;
import com.agent.mvp.infra.TokenBlacklistService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private UserService userService;

    @Mock private PasswordEncoder passwordEncoder;

    @Mock private JwtService jwtService;

    @Mock private TokenBlacklistService tokenBlacklistService;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService =
                new AuthService(userService, passwordEncoder, jwtService, tokenBlacklistService);
    }

    @Test
    void testLogoutSuccess() {
        Jws<Claims> accessJws = mock(Jws.class);
        Claims accessClaims = mock(Claims.class);
        when(accessJws.getBody()).thenReturn(accessClaims);
        long futureTime = System.currentTimeMillis() + 10000;
        when(accessClaims.getExpiration()).thenReturn(new Date(futureTime));
        when(jwtService.parseToken("valid-access-token")).thenReturn(accessJws);

        Jws<Claims> refreshJws = mock(Jws.class);
        Claims refreshClaims = mock(Claims.class);
        when(refreshJws.getBody()).thenReturn(refreshClaims);
        long futureTimeRefresh = System.currentTimeMillis() + 20000;
        when(refreshClaims.getExpiration()).thenReturn(new Date(futureTimeRefresh));
        when(jwtService.parseToken("valid-refresh-token")).thenReturn(refreshJws);

        authService.logout("valid-access-token", "valid-refresh-token");

        verify(tokenBlacklistService).blacklistToken(eq("valid-access-token"), any(Duration.class));
        verify(tokenBlacklistService)
                .blacklistToken(eq("valid-refresh-token"), any(Duration.class));
    }

    @Test
    void testLogoutWithExpiredOrInvalidTokensThrowsUnauthorizedException() {
        when(jwtService.parseToken("invalid-token"))
                .thenThrow(new RuntimeException("invalid token"));

        assertThatThrownBy(() -> authService.logout("invalid-token", null))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid token during logout");

        verify(tokenBlacklistService, never()).blacklistToken(anyString(), any(Duration.class));
    }

    @Test
    void testLogoutWithEmptyTokensDoesNotCallBlacklist() {
        authService.logout("", "   ");
        verify(tokenBlacklistService, never()).blacklistToken(anyString(), any(Duration.class));
    }

    @Test
    void testRegisterEmailAlreadyExists() {
        when(userService.existsByEmail("existing@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register("existing@example.com", "password"))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("Email already exists");
    }

    @Test
    void testRegisterSuccess() {
        String email = "new@example.com";
        String password = "password";
        String hashedPassword = "hashed-password";
        User savedUser = new User();
        savedUser.setId(UUID.randomUUID());
        savedUser.setEmail(email);
        savedUser.setPasswordHash(hashedPassword);
        savedUser.setCreatedAt(Instant.now());

        when(userService.existsByEmail(email)).thenReturn(false);
        when(passwordEncoder.encode(password)).thenReturn(hashedPassword);
        when(userService.createUser(any(User.class))).thenReturn(savedUser);

        UserProfileResponse response = authService.register(email, password);

        assertThat(response.email()).isEqualTo(email);
        assertThat(response.id()).isEqualTo(savedUser.getId());
    }

    @Test
    void testLoginUserNotFound() {
        LoginRequest request = new LoginRequest("nonexistent@example.com", "password");
        when(userService.getUserByEmail("nonexistent@example.com")).thenReturn(null);

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    void testLoginWrongPassword() {
        LoginRequest request = new LoginRequest("user@example.com", "wrong-password");
        User user = new User();
        user.setEmail("user@example.com");
        user.setPasswordHash("hashed-password");

        when(userService.getUserByEmail("user@example.com")).thenReturn(user);
        when(passwordEncoder.matches("wrong-password", "hashed-password")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    void testLoginSuccess() {
        LoginRequest request = new LoginRequest("user@example.com", "correct-password");
        User user = new User();
        user.setEmail("user@example.com");
        user.setPasswordHash("hashed-password");

        when(userService.getUserByEmail("user@example.com")).thenReturn(user);
        when(passwordEncoder.matches("correct-password", "hashed-password")).thenReturn(true);

        JwtService.TokenPair tokenPair =
                new JwtService.TokenPair("access-token", "refresh-token", 3600);
        when(jwtService.issueTokens(user)).thenReturn(tokenPair);

        TokenResponse response = authService.login(request);

        assertThat(response.accessToken()).isEqualTo("access-token");
        assertThat(response.refreshToken()).isEqualTo("refresh-token");
        assertThat(response.expiresInSeconds()).isEqualTo(3600);
    }

    @Test
    void testRefreshNotARefreshToken() {
        String invalidToken = "not-a-refresh-token";
        when(jwtService.isRefreshToken(invalidToken)).thenReturn(false);

        assertThatThrownBy(() -> authService.refresh(invalidToken))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Refresh token required");
    }

    @Test
    void testRefreshWhenTokenIsBlacklisted() {
        String token = "blacklisted-refresh-token";
        when(jwtService.isRefreshToken(token)).thenReturn(true);
        when(tokenBlacklistService.isBlacklisted(token)).thenReturn(true);

        assertThatThrownBy(() -> authService.refresh(token))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Refresh token has been revoked or already used");
    }

    @Test
    void testRefreshUserNotFound() {
        String token = "valid-refresh-token";
        UUID userId = UUID.randomUUID();
        when(jwtService.isRefreshToken(token)).thenReturn(true);
        when(tokenBlacklistService.isBlacklisted(token)).thenReturn(false);
        when(jwtService.extractUserId(token)).thenReturn(userId);
        when(userService.getUserById(userId)).thenReturn(null);

        assertThatThrownBy(() -> authService.refresh(token))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("User not found");
    }

    @Test
    void testRefreshRotatedToken() {
        String token = "valid-refresh-token";
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setTokenVersion(5);

        when(jwtService.isRefreshToken(token)).thenReturn(true);
        when(tokenBlacklistService.isBlacklisted(token)).thenReturn(false);
        when(jwtService.extractUserId(token)).thenReturn(userId);
        when(userService.getUserById(userId)).thenReturn(user);
        when(jwtService.extractTokenVersion(token)).thenReturn(4);

        assertThatThrownBy(() -> authService.refresh(token))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Refresh token has been rotated");
    }

    @Test
    void testRefreshSuccessExistingUser() {
        String token = "valid-refresh-token";
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setTokenVersion(5);

        when(jwtService.isRefreshToken(token)).thenReturn(true);
        when(tokenBlacklistService.isBlacklisted(token)).thenReturn(false);
        when(jwtService.extractUserId(token)).thenReturn(userId);
        when(userService.getUserById(userId)).thenReturn(user);
        when(jwtService.extractTokenVersion(token)).thenReturn(5);

        Jws<Claims> refreshJws = mock(Jws.class);
        Claims refreshClaims = mock(Claims.class);
        when(refreshJws.getBody()).thenReturn(refreshClaims);
        long futureTimeRefresh = System.currentTimeMillis() + 20000;
        when(refreshClaims.getExpiration()).thenReturn(new Date(futureTimeRefresh));
        when(jwtService.parseToken(token)).thenReturn(refreshJws);

        JwtService.TokenPair tokenPair =
                new JwtService.TokenPair("new-access-token", "new-refresh-token", 3600);
        when(jwtService.issueTokens(user)).thenReturn(tokenPair);

        TokenResponse response = authService.refresh(token);

        assertThat(response.accessToken()).isEqualTo("new-access-token");
        assertThat(response.refreshToken()).isEqualTo("new-refresh-token");
        assertThat(user.getTokenVersion()).isEqualTo(6);
        verify(userService).updateUser(user);
        verify(tokenBlacklistService).blacklistToken(eq(token), any(Duration.class));
    }

    @Test
    void testRefreshSuccessNewUser() {
        String token = "valid-refresh-token";
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(null);
        user.setTokenVersion(0);

        when(jwtService.isRefreshToken(token)).thenReturn(true);
        when(tokenBlacklistService.isBlacklisted(token)).thenReturn(false);
        when(jwtService.extractUserId(token)).thenReturn(userId);
        when(userService.getUserById(userId)).thenReturn(user);
        when(jwtService.extractTokenVersion(token)).thenReturn(0);

        Jws<Claims> refreshJws = mock(Jws.class);
        Claims refreshClaims = mock(Claims.class);
        when(refreshJws.getBody()).thenReturn(refreshClaims);
        long futureTimeRefresh = System.currentTimeMillis() + 20000;
        when(refreshClaims.getExpiration()).thenReturn(new Date(futureTimeRefresh));
        when(jwtService.parseToken(token)).thenReturn(refreshJws);

        JwtService.TokenPair tokenPair =
                new JwtService.TokenPair("new-access-token", "new-refresh-token", 3600);
        when(jwtService.issueTokens(user)).thenReturn(tokenPair);

        TokenResponse response = authService.refresh(token);

        assertThat(response.accessToken()).isEqualTo("new-access-token");
        assertThat(user.getTokenVersion()).isEqualTo(1);
        verify(userService).createUser(user);
        verify(tokenBlacklistService).blacklistToken(eq(token), any(Duration.class));
    }

    @Test
    void testMeUserNotFound() {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser authUser = new AuthenticatedUser(userId, "user@example.com");
        when(userService.getUserById(userId)).thenReturn(null);

        assertThatThrownBy(() -> authService.me(authUser))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("User not found");
    }

    @Test
    void testMeSuccess() {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser authUser = new AuthenticatedUser(userId, "user@example.com");
        User user = new User();
        user.setId(userId);
        user.setEmail("user@example.com");

        when(userService.getUserById(userId)).thenReturn(user);

        UserProfileResponse response = authService.me(authUser);

        assertThat(response.id()).isEqualTo(userId);
        assertThat(response.email()).isEqualTo("user@example.com");
    }

    @Test
    void testUpdateConfigUserNotFound() {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser authUser = new AuthenticatedUser(userId, "user@example.com");
        UpdateUserConfigRequest request =
                new UpdateUserConfigRequest("http://localhost", "api-key");
        when(userService.getUserById(userId)).thenReturn(null);

        assertThatThrownBy(() -> authService.updateConfig(authUser, request))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("User not found");
    }

    @Test
    void testUpdateConfigSuccessExistingUser() {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser authUser = new AuthenticatedUser(userId, "user@example.com");
        UpdateUserConfigRequest request =
                new UpdateUserConfigRequest("http://new-url", "new-api-key");
        User user = new User();
        user.setId(userId);
        user.setEmail("user@example.com");

        when(userService.getUserById(userId)).thenReturn(user);

        UserProfileResponse response = authService.updateConfig(authUser, request);

        assertThat(response.customBaseUrl()).isEqualTo("http://new-url");
        verify(userService).updateUser(user);
    }

    @Test
    void testUpdateConfigSuccessNewUser() {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser authUser = new AuthenticatedUser(userId, "user@example.com");
        UpdateUserConfigRequest request =
                new UpdateUserConfigRequest("http://new-url", "new-api-key");
        User user = new User();
        user.setId(null);
        user.setEmail("user@example.com");

        when(userService.getUserById(userId)).thenReturn(user);

        UserProfileResponse response = authService.updateConfig(authUser, request);

        assertThat(response.customBaseUrl()).isEqualTo("http://new-url");
        verify(userService).createUser(user);
    }

    @Test
    void testMaskingApiKey() {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser authUser = new AuthenticatedUser(userId, "user@example.com");
        User user = new User();
        user.setId(userId);
        user.setEmail("user@example.com");

        user.setCustomApiKey("12345678");
        when(userService.getUserById(userId)).thenReturn(user);
        UserProfileResponse response = authService.me(authUser);
        assertThat(response.customApiKey()).isEqualTo("123***678");

        user.setCustomApiKey("12345");
        response = authService.me(authUser);
        assertThat(response.customApiKey()).isEqualTo("***");

        user.setCustomApiKey(null);
        response = authService.me(authUser);
        assertThat(response.customApiKey()).isNull();
    }
}
