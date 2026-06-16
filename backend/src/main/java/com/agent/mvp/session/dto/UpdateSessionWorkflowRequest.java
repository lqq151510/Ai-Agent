package com.agent.mvp.session.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateSessionWorkflowRequest(
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
                String taskStatus) {}
