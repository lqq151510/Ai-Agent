package com.agent.mvp.modelsource.dto;

import jakarta.validation.constraints.Size;

public record TestPromptRequest(
        @Size(max = 2000, message = "Prompt 不能超过 2000 个字符") String prompt) {}
