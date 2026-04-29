package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import picocli.CommandLine;

import java.util.HashMap;
import java.util.Map;

@CommandLine.Command(name = "chat", description = "Send a chat message")
public class ChatCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @CommandLine.Option(names = "--session")
    private String sessionId;

    @CommandLine.Option(names = "--message", required = true)
    private String message;

    @CommandLine.Option(names = "--provider")
    private String provider;

    @CommandLine.Option(names = "--model")
    private String model;

    @Override
    public void run() {
        CliStateStore store = new CliStateStore(root.objectMapper());
        AuthState state = store.read();
        ensureLoggedIn(state);

        String sid = sessionId != null ? sessionId : state.getActiveSessionId();
        if (sid == null || sid.isBlank()) {
            throw new RuntimeException("No session specified. Use --session or create-session first.");
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("sessionId", sid);
        payload.put("message", message);
        if (provider != null && !provider.isBlank()) {
            payload.put("provider", provider);
        }
        if (model != null && !model.isBlank()) {
            payload.put("model", model);
        }

        Map<String, Object> res = root.apiClient().postAuthenticated("/api/agent/chat", payload, state, store);
        System.out.println("assistant> " + res.get("reply"));
    }

    private void ensureLoggedIn(AuthState state) {
        if (state.getAccessToken() == null || state.getAccessToken().isBlank()) {
            throw new RuntimeException("Please login first.");
        }
    }
}
