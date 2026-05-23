package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import picocli.CommandLine;

import java.util.Map;

@CommandLine.Command(name = "login", description = "Login with email and password")
public class LoginCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @CommandLine.Option(names = "--email", required = true)
    private String email;

    @CommandLine.Option(names = "--password", required = true)
    private String password;

    @Override
    public void run() {
        Map<String, Object> res = root.apiClient().post(
                "/api/v1/auth/login",
                Map.of("email", email, "password", password),
                null
        );

        AuthState state = new AuthState();
        state.setAccessToken(String.valueOf(res.get("accessToken")));
        state.setRefreshToken(String.valueOf(res.get("refreshToken")));

        new CliStateStore(root.objectMapper()).write(state);
        System.out.println("Login success.");
    }
}
