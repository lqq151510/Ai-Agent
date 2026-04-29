package com.agent.mvp.system.dto;

import com.agent.mvp.agent.ModelProviderType;

public record ModelOption(
        ModelProviderType provider,
        String model,
        boolean isDefault
) {
}

