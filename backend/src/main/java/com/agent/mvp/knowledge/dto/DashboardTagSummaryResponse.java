package com.agent.mvp.knowledge.dto;

import java.util.UUID;

public record DashboardTagSummaryResponse(UUID id, String name, String color, long usageCount) {}
