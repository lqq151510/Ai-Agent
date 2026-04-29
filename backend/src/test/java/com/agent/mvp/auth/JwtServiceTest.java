package com.agent.mvp.auth;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "jwtSecret", "01234567890123456789012345678901");
        ReflectionTestUtils.setField(jwtService, "accessExpSeconds", 3600L);
        ReflectionTestUtils.setField(jwtService, "refreshExpSeconds", 3600L * 24);
        ReflectionTestUtils.invokeMethod(jwtService, "init");
    }

    @Test
    void shouldIssueAccessAndRefreshTokens() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("test@example.com");
        user.setPasswordHash("x");

        JwtService.TokenPair pair = jwtService.issueTokens(user);

        assertNotNull(pair.accessToken());
        assertNotNull(pair.refreshToken());
        assertTrue(jwtService.isAccessToken(pair.accessToken()));
        assertTrue(jwtService.isRefreshToken(pair.refreshToken()));
        assertEquals(user.getId(), jwtService.extractUserId(pair.accessToken()));
        assertEquals(user.getEmail(), jwtService.extractEmail(pair.accessToken()));
    }
}
