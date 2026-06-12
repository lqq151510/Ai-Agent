package com.agent.mvp.coach.dto;

import java.util.List;

public record RequirementBreakdown(
        String goal,
        List<CoachItem> modules,
        List<CoachItem> dataStructures,
        List<ApiEndpointPlan> apiEndpoints,
        List<CoachItem> risks,
        List<String> testPoints) {}
