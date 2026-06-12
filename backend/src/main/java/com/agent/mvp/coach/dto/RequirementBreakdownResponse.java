package com.agent.mvp.coach.dto;

import java.util.UUID;

public record RequirementBreakdownResponse(
        UUID runId, RequirementBreakdown breakdown, String rawText, String parseWarning) {}
