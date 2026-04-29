package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import picocli.CommandLine;

import java.util.List;
import java.util.Map;

@CommandLine.Command(name = "sessions", description = "List sessions")
public class SessionsCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @Override
    public void run() {
        CliStateStore store = new CliStateStore(root.objectMapper());
        AuthState state = store.read();
        ensureLoggedIn(state);

        List<Map<String, Object>> sessions = root.apiClient().getListAuthenticated("/api/sessions", state, store);
        if (sessions.isEmpty()) {
            System.out.println("No sessions.");
            return;
        }

        for (Map<String, Object> session : sessions) {
            System.out.printf("%s | %s | %s/%s%n",
                    session.get("id"),
                    session.get("title"),
                    session.get("provider"),
                    session.get("model"));
        }
    }

    private void ensureLoggedIn(AuthState state) {
        if (state.getAccessToken() == null || state.getAccessToken().isBlank()) {
            throw new RuntimeException("Please login first.");
        }
    }
}
