package com.agent.mvp.session.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record UpdateSessionContextTokenLimitRequest(
        @Min(value = 500, message = "contextTokenLimit must be >= 500")
        @Max(value = 32768, message = "contextTokenLimit must be <= 32768")
        Integer contextTokenLimit
) {
}
