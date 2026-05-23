package com.agent.mvp.coach.dto;

import com.agent.mvp.agent.ModelProviderType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RequirementBreakdownRequest(
        @NotBlank(message = "Requirement is required")
        @Size(max = 8000, message = "Requirement must be <= 8000 characters")
        String requirement,
        ModelProviderType provider,
        String model
) {
}
