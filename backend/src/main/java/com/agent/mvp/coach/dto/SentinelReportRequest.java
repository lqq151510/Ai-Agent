package com.agent.mvp.coach.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SentinelReportRequest(
        @NotBlank @Size(max = 128) String projectName,
        @Size(max = 32) String environment,
        @Size(max = 64) String tag,
        @NotBlank @Size(max = 12000) String stackTrace) {
    public SentinelReportRequest(String projectName, String stackTrace) {
        this(projectName, null, null, stackTrace);
    }
}
