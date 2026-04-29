package com.agent.mvp.system.dto;

public record ReadinessCheck(
        String name,
        boolean ok,
        String detail
) {
}

