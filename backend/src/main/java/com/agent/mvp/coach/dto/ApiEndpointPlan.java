package com.agent.mvp.coach.dto;

public record ApiEndpointPlan(
        String method,
        String path,
        String purpose
) {
}
