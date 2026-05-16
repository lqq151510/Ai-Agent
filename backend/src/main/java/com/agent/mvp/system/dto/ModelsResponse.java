package com.agent.mvp.system.dto;

import com.agent.mvp.agent.ModelProviderType;

import java.time.Instant;
import java.util.List;

public record ModelsResponse(
        ModelProviderType defaultProvider,
        String defaultModel,
        java.util.List<ProviderOption> providers,
        List<ModelOption> options,
        int availableCount,
        boolean fallbackUsed,
        String detail,
        Instant timestamp
) {
}
