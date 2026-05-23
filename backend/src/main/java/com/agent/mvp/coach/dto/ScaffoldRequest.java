package com.agent.mvp.coach.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ScaffoldRequest(
        @NotBlank(message = "Preset is required")
        String preset,
        @NotBlank(message = "Project name is required")
        @Pattern(regexp = "[a-zA-Z][a-zA-Z0-9-]{1,63}", message = "Project name must start with a letter and use letters, numbers, or hyphen")
        String projectName,
        @NotBlank(message = "Base package is required")
        @Size(max = 120, message = "Base package must be <= 120 characters")
        String basePackage,
        String description
) {
}
