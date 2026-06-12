package com.agent.mvp.auth.dto;

public record TokenResponse(String accessToken, String refreshToken, long expiresInSeconds) {}
