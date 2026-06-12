package com.agent.mvp.coach.dto;

import com.agent.mvp.agent.ModelProviderType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LogDiagnosisRequest(
        @NotBlank(message = "Log content is required")
                @Size(max = 12000, message = "Log content must be <= 12000 characters")
                String logContent,
        String context,
        ModelProviderType provider,
        String model) {}
