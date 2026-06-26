package com.agent.mvp.knowledge.dto;

import java.time.Instant;
import java.util.List;

public record DashboardSummaryResponse(
        long totalItems,
        long inboxItems,
        long readyItems,
        long failedItems,
        List<DashboardRecentItemResponse> recentItems,
        List<DashboardTagSummaryResponse> topTags,
        Instant generatedAt) {}
