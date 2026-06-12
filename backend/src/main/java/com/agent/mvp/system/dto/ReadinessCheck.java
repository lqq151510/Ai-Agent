package com.agent.mvp.system.dto;

import java.util.Map;

public record ReadinessCheck(
        String name,
        boolean ok,
        String detail,
        String code,
        Long latencyMs,
        Map<String, String> metadata) {}
