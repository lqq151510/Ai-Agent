package com.agent.mvp.session.dto;

import com.agent.mvp.agent.ModelProviderType;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateSessionRequest(
        @Size(max = 120, message = "Title must be <= 120 chars")
        String title,
        ModelProviderType provider,
        @Size(max = 128, message = "model must be <= 128 chars")
        @Pattern(regexp = "^[\\w./:-]{0,128}$", message = "model format is invalid")
        String model
) {
}
