package com.agent.mvp.agent.dto;

import com.agent.mvp.agent.tooling.ToolSpec;

import java.util.List;

public record ModelChatRequest(
        String model,
        List<ModelChatMessage> messages,
        List<ToolSpec> tools,
        String toolChoice,
        String customBaseUrl,
        String customApiKey
) {
}
