package com.agent.mvp.coach.dto;

import java.util.UUID;

public record LogDiagnosisResponse(
        UUID runId, LogDiagnosis diagnosis, String rawText, String parseWarning) {}
