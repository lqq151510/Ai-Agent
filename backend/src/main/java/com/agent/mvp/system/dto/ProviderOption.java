package com.agent.mvp.system.dto;

import com.agent.mvp.agent.ModelProviderType;

public record ProviderOption(
        ModelProviderType type,
        String providerId,
        String displayName,
        String apiStyle,
        boolean openAiCompatible,
        boolean isDefault) {}
