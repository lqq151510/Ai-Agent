package com.agent.mvp.agent.service;

import com.agent.mvp.agent.tooling.ToolSpec;
import java.util.ArrayList;
import java.util.List;

/** Resolves the tool surface that is visible to a single chat request. */
final class AgentToolPolicy {

    private AgentToolPolicy() {}

    static List<ToolSpec> resolve(
            boolean toolsEnabled, List<ToolSpec> serverTools, List<ToolSpec> clientTools) {
        if (!toolsEnabled) {
            return List.of();
        }

        List<ToolSpec> resolved = new ArrayList<>();
        if (serverTools != null) {
            resolved.addAll(serverTools);
        }
        if (clientTools != null) {
            resolved.addAll(clientTools);
        }
        return resolved;
    }
}
