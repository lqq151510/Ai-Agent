package com.agent.mvp.agent.dto;

import com.agent.mvp.agent.ModelProviderType;

public record ResolvedModelConfig(ModelProviderType provider, String model) {}
