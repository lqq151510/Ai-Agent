package com.agent.mvp.coach.dto;

import java.util.List;

public record LogDiagnosis(
        String symptom,
        String rootCause,
        String triggerCondition,
        String minimalFix,
        List<String> verificationSteps
) {
}
