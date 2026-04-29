package com.agent.cli.model;

public class AuthState {

    private String accessToken;
    private String refreshToken;
    private String activeSessionId;

    public String getAccessToken() {
        return accessToken;
    }

    public void setAccessToken(String accessToken) {
        this.accessToken = accessToken;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }

    public String getActiveSessionId() {
        return activeSessionId;
    }

    public void setActiveSessionId(String activeSessionId) {
        this.activeSessionId = activeSessionId;
    }
}
