package com.agent.mvp.auth.dto;

public record UpdateUserConfigRequest(
        String customBaseUrl,
        String customApiKey
) {
}
