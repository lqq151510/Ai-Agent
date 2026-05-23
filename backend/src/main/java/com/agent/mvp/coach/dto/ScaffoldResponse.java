package com.agent.mvp.coach.dto;

import java.util.List;
import java.util.UUID;

public record ScaffoldResponse(
        UUID runId,
        String preset,
        String projectName,
        List<String> fileTree,
        List<ScaffoldFilePreview> previews,
        List<String> startCommands,
        String downloadUrl
) {
}
