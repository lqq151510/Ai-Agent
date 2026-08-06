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
        UUID modelSourceId,
        String customApiKey,
        List<ToolSpec> clientTools,
        Boolean toolsEnabled) {
    /**
     * Keeps the pre-local-assistant request shape source-compatible. Existing callers remain
     * tool-enabled unless they explicitly opt out.
     */
    public ChatRequest(
            UUID sessionId,
            String message,
            ModelProviderType provider,
            String model,
            Integer maxContextTokens,
            String systemContext,
            UUID modelSourceId,
            String customApiKey,
            List<ToolSpec> clientTools) {
        this(
                sessionId,
                message,
                provider,
                model,
                maxContextTokens,
                systemContext,
                modelSourceId,
                customApiKey,
                clientTools,
                true);
    }

    public ChatRequest(
            UUID sessionId,
            String message,
            ModelProviderType provider,
            String model,
            Integer maxContextTokens,
            String systemContext,
            UUID modelSourceId,
            String customApiKey) {
        this(
                sessionId,
                message,
                provider,
                model,
                maxContextTokens,
                systemContext,
                modelSourceId,
                customApiKey,
                null,
                true);
    }

    /**
     * JSON requests created before this flag existed leave it absent. Preserve their original
     * behavior, while allowing the local desktop assistant to opt out explicitly.
     */
    public boolean allowsTools() {
        return !Boolean.FALSE.equals(toolsEnabled);
    }
}
