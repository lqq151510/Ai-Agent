package com.agent.mvp.agent.dto;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.tooling.ToolSpec;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record ChatRequest(
        @NotNull(message = "sessionId is required") UUID sessionId,
        @NotBlank(message = "message is required")
                @Size(max = 8000, message = "message must be <= 8000 chars")
                String message,
        ModelProviderType provider,
        @Size(max = 128, message = "model must be <= 128 chars")
                @Pattern(regexp = "^[\\w./:-]{0,128}$", message = "model format is invalid")
                String model,
        @Min(value = 500, message = "maxContextTokens must be >= 500")
                @Max(value = 200000, message = "maxContextTokens must be <= 200000")
                Integer maxContextTokens,
        @Size(max = 50000, message = "systemContext must be <= 50000 chars") String systemContext,
        String customBaseUrl,
        String customApiKey,
        List<ToolSpec> clientTools) {
    public ChatRequest(
            UUID sessionId,
            String message,
            ModelProviderType provider,
            String model,
            Integer maxContextTokens,
            String systemContext,
            String customBaseUrl,
            String customApiKey) {
        this(sessionId, message, provider, model, maxContextTokens, systemContext, customBaseUrl, customApiKey, null);
    }
}
