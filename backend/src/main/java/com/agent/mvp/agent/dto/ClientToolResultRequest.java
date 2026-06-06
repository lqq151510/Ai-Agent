package com.agent.mvp.agent.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ClientToolResultRequest(
        @NotBlank String callId,
        @NotNull String result
) {
}
