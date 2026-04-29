package com.agent.mvp.auth.service;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.common.exception.UnauthorizedException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private static final String CLAIM_TOKEN_TYPE = "tokenType";
    private static final String CLAIM_USER_ID = "uid";
    private static final String CLAIM_TOKEN_VERSION = "tv";

    @Value("${security.jwt.secret}")
    private String jwtSecret;

    @Value("${security.jwt.access-exp-seconds:3600}")
    private long accessExpSeconds;

    @Value("${security.jwt.refresh-exp-seconds:2592000}")
    private long refreshExpSeconds;

    private SecretKey secretKey;

    @PostConstruct
    void init() {
        if (jwtSecret == null || jwtSecret.length() < 32) {
            throw new IllegalStateException("security.jwt.secret must be at least 32 characters");
        }
        this.secretKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    public TokenPair issueTokens(User user) {
        String accessToken = buildToken(user, "access", accessExpSeconds);
        String refreshToken = buildToken(user, "refresh", refreshExpSeconds);
        return new TokenPair(accessToken, refreshToken, accessExpSeconds);
    }

    public UUID extractUserId(String token) {
        return UUID.fromString(parseToken(token).getBody().get(CLAIM_USER_ID, String.class));
    }

    public String extractEmail(String token) {
        return parseToken(token).getBody().getSubject();
    }

    public boolean isAccessToken(String token) {
        return "access".equals(parseToken(token).getBody().get(CLAIM_TOKEN_TYPE, String.class));
    }

    public boolean isRefreshToken(String token) {
        return "refresh".equals(parseToken(token).getBody().get(CLAIM_TOKEN_TYPE, String.class));
    }

    public int extractTokenVersion(String token) {
        Integer value = parseToken(token).getBody().get(CLAIM_TOKEN_VERSION, Integer.class);
        return value == null ? 0 : value;
    }

    public Jws<Claims> parseToken(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token);
        } catch (JwtException | IllegalArgumentException ex) {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }

    private String buildToken(User user, String type, long expSeconds) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getEmail())
                .claim(CLAIM_USER_ID, user.getId().toString())
                .claim(CLAIM_TOKEN_TYPE, type)
                .claim(CLAIM_TOKEN_VERSION, user.getTokenVersion())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(expSeconds)))
                .signWith(secretKey)
                .compact();
    }

    public record TokenPair(String accessToken, String refreshToken, long accessTokenExpiresInSeconds) {
    }
}
