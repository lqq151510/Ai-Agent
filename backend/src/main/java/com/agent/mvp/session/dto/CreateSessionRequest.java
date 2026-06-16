package com.agent.mvp.session.dto;

import com.agent.mvp.agent.ModelProviderType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateSessionRequest(
        @Size(max = 120, message = "Title must be <= 120 chars") String title,
        ModelProviderType provider,
        @Size(max = 128, message = "model must be <= 128 chars")
                @Pattern(regexp = "^[\\w./:-]{0,128}$", message = "model format is invalid")
                String model,
        @Size(max = 24, message = "taskType must be <= 24 chars")
                @Pattern(
                        regexp = "^(chat|requirements|scaffold|logs)?$",
                        message = "taskType is invalid")
                String taskType,
        @Size(max = 160, message = "taskGoal must be <= 160 chars") String taskGoal,
        @Size(max = 24, message = "taskStatus must be <= 24 chars")
                @Pattern(
                        regexp = "^(planned|in_progress|blocked|done)?$",
                        message = "taskStatus is invalid")
                String taskStatus,
        @Min(value = 500, message = "contextTokenLimit must be >= 500")
                @Max(value = 32768, message = "contextTokenLimit must be <= 32768")
                Integer contextTokenLimit) {}
