package com.agent.mvp.agent.dto;

import java.util.List;

public record ModelChatRequest(
        String model,
        List<ModelChatMessage> messages
) {
}
