package com.agent.mvp.knowledge.dto;

import java.time.Instant;
import java.util.UUID;

public record DashboardRecentItemResponse(
        UUID id, String title, String status, String sourceType, Instant updatedAt) {}
