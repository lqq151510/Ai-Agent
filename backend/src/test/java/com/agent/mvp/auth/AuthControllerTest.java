package com.agent.mvp.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.dto.LoginRequest;
import com.agent.mvp.auth.dto.LogoutRequest;
import com.agent.mvp.auth.dto.RefreshRequest;
import com.agent.mvp.auth.dto.RegisterRequest;
import com.agent.mvp.auth.dto.TokenResponse;
import com.agent.mvp.auth.dto.UpdateUserConfigRequest;
import com.agent.mvp.auth.dto.UserProfileResponse;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.auth.service.AuthService;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RateLimiterService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AuthControllerTest {

    private AuthService authService;
    private RateLimiterService rateLimiterService;
    private AppProperties appProperties;
    private MockMvc mockMvc;
    private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        rateLimiterService = mock(RateLimiterService.class);
        appProperties = new AppProperties();
        // Set up default rate limit configs
        appProperties.getRateLimit().setRegisterPerMinute(10);
        appProperties.getRateLimit().setLoginPerMinute(10);
        appProperties.getRateLimit().setRefreshPerMinute(10);

        AuthController authController =
                new AuthController(authService, rateLimiterService, appProperties);
        mockMvc =
                MockMvcBuilders.standaloneSetup(authController)
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(new MappingJackson2HttpMessageConverter())
                        .build();
    }

    @Test
    void shouldRegisterSuccessfullyWithStrongPassword() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "StrongP@ss123");
        when(rateLimiterService.allow(any(), anyLong(), any(Duration.class))).thenReturn(true);
        when(authService.register("test@example.com", "StrongP@ss123"))
                .thenReturn(
                        new UserProfileResponse(
                                UUID.randomUUID(), "test@example.com", Instant.now(), null, null));

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());
    }

    @Test
    void shouldReturnBadRequestWhenPasswordIsWeak() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "WeakPassword123");

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                .andExpect(
                        jsonPath("$.message")
                                .value(
                                        "Password must include upper/lowercase letters, digits and"
                                                + " special characters"));
    }

    @Test
    void shouldReturnBadRequestWhenPasswordIsTooShort() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "Sh1!");

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @Test
    void shouldReturnTooManyRequestsWhenLimitExceededByIp() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "StrongP@ss123");

        // mock IP rate limit check returns false
        when(rateLimiterService.allow(
                        eq("ratelimit:register:ip:127.0.0.1"), anyLong(), any(Duration.class)))
                .thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request))
                                .with(
                                        servletRequest -> {
                                            servletRequest.setRemoteAddr("127.0.0.1");
                                            return servletRequest;
                                        }))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
    }

    @Test
    void shouldReturnTooManyRequestsWhenLimitExceededByEmail() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "StrongP@ss123");

        // IP limit passes
        when(rateLimiterService.allow(
                        eq("ratelimit:register:ip:127.0.0.1"), anyLong(), any(Duration.class)))
                .thenReturn(true);
        // Email limit fails
        when(rateLimiterService.allow(
                        eq("ratelimit:register:email:test@example.com"),
                        anyLong(),
                        any(Duration.class)))
                .thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request))
                                .with(
                                        servletRequest -> {
                                            servletRequest.setRemoteAddr("127.0.0.1");
                                            return servletRequest;
                                        }))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
    }

    @Test
    void shouldLoginSuccessfully() throws Exception {
        LoginRequest request = new LoginRequest("test@example.com", "password");
        when(rateLimiterService.allow(any(), anyLong(), any(Duration.class))).thenReturn(true);
        when(authService.login(any())).thenReturn(new TokenResponse("access", "refresh", 3600));

        mockMvc.perform(
                        post("/api/v1/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("access"))
                .andExpect(jsonPath("$.refreshToken").value("refresh"));
    }

    @Test
    void shouldRefreshSuccessfully() throws Exception {
        RefreshRequest request = new RefreshRequest("old-refresh-token");
        when(rateLimiterService.allow(any(), anyLong(), any(Duration.class))).thenReturn(true);
        when(authService.refresh("old-refresh-token"))
                .thenReturn(new TokenResponse("new-access", "new-refresh", 3600));

        mockMvc.perform(
                        post("/api/v1/auth/refresh")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-access"));
    }

    @Test
    void shouldLogoutSuccessfullyWithHeader() throws Exception {
        LogoutRequest request = new LogoutRequest("my-refresh-token");

        mockMvc.perform(
                        post("/api/v1/auth/logout")
                                .header(HttpHeaders.AUTHORIZATION, "Bearer my-access-token")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        verify(authService).logout("my-access-token", "my-refresh-token");
    }

    @Test
    void shouldLogoutSuccessfullyWithoutHeader() throws Exception {
        LogoutRequest request = new LogoutRequest("my-refresh-token");

        mockMvc.perform(
                        post("/api/v1/auth/logout")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        verify(authService).logout(null, "my-refresh-token");
    }

    @Test
    void shouldReturnMeSuccessfully() throws Exception {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser principal = new AuthenticatedUser(userId, "test@example.com");
        Authentication authentication = new UsernamePasswordAuthenticationToken(principal, null);

        when(authService.me(principal))
                .thenReturn(
                        new UserProfileResponse(
                                userId, "test@example.com", Instant.now(), null, null));

        mockMvc.perform(get("/api/v1/auth/me").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("test@example.com"));
    }

    @Test
    void shouldReturnUnauthorizedWhenMeNotLoggedIn() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void shouldUpdateConfigSuccessfully() throws Exception {
        UUID userId = UUID.randomUUID();
        AuthenticatedUser principal = new AuthenticatedUser(userId, "test@example.com");
        Authentication authentication = new UsernamePasswordAuthenticationToken(principal, null);

        UpdateUserConfigRequest request =
                new UpdateUserConfigRequest("http://custom-url", "api-key");
        when(authService.updateConfig(eq(principal), any(UpdateUserConfigRequest.class)))
                .thenReturn(
                        new UserProfileResponse(
                                userId,
                                "test@example.com",
                                Instant.now(),
                                "http://custom-url",
                                "***"));

        mockMvc.perform(
                        post("/api/v1/auth/config")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customBaseUrl").value("http://custom-url"));
    }

    @Test
    void shouldResolveClientIpFromXRealIpHeader() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "StrongP@ss123");

        // mock IP rate limit check returns false for header IP
        when(rateLimiterService.allow(
                        eq("ratelimit:register:ip:203.0.113.1"), anyLong(), any(Duration.class)))
                .thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .header("X-Real-IP", "203.0.113.1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isTooManyRequests());
    }
}
