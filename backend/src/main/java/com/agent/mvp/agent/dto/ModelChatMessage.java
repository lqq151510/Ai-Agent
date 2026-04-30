package com.agent.mvp.agent.dto;

public record ModelChatMessage(String role, String content, String name) {

    public static ModelChatMessage of(String role, String content) {
        return new ModelChatMessage(role, content, null);
    }

    public static ModelChatMessage tool(String name, String content) {
        return new ModelChatMessage("tool", content, name);
    }
}
