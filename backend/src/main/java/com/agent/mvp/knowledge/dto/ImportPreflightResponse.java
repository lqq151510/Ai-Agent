package com.agent.mvp.knowledge.dto;

import java.util.List;

public record ImportPreflightResponse(List<String> existingContentHashes) {

    public ImportPreflightResponse {
        existingContentHashes = List.copyOf(existingContentHashes);
    }
}
