package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import picocli.CommandLine;

import java.util.HashMap;
import java.util.Map;

@CommandLine.Command(name = "create-session", description = "Create a new chat session")
public class CreateSessionCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @CommandLine.Option(names = "--title")
    private String title;

    @CommandLine.Option(names = "--provider")
    private String provider;

    @CommandLine.Option(names = "--model")
    private String model;

    @Override
    public void run() {
        CliStateStore store = new CliStateStore(root.objectMapper());
        AuthState state = store.read();
        ensureLoggedIn(state);

        Map<String, Object> payload = new HashMap<>();
        payload.put("title", title == null || title.isBlank() ? "CLI Session" : title);
        payload.put("provider", provider == null || provider.isBlank() ? "OPENAI" : provider);
        if (model != null && !model.isBlank()) {
            payload.put("model", model);
        }

        Map<String, Object> res = root.apiClient().postAuthenticated("/api/sessions", payload, state, store);

        String sessionId = String.valueOf(res.get("id"));
        state.setActiveSessionId(sessionId);
        store.write(state);

        System.out.println("Created session: " + sessionId);
    }

    private void ensureLoggedIn(AuthState state) {
        if (state.getAccessToken() == null || state.getAccessToken().isBlank()) {
            throw new RuntimeException("Please login first.");
        }
    }
}
