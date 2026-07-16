package com.agent.mvp.agent.dto;

import java.util.List;

public record OpenAIChatRequest(
        String model,
        List<OpenAIMessage> messages,
        boolean stream,
        Double temperature,
        Integer max_tokens) {}
