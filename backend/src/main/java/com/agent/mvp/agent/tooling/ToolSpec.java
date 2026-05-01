package com.agent.mvp.agent.tooling;

import java.util.Map;

public record ToolSpec(
        String name,
        String description,
        Map<String, Object> inputJsonSchema
) {
}
