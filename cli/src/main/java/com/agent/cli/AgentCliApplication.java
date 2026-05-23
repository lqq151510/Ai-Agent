package com.agent.cli;

import com.agent.cli.cmd.ChatCommand;
import com.agent.cli.cmd.CreateSessionCommand;
import com.agent.cli.cmd.LoginCommand;
import com.agent.cli.cmd.ReleaseReportCommand;
import com.agent.cli.cmd.StreamChatCommand;
import com.agent.cli.cmd.ReplCommand;
import com.agent.cli.cmd.SessionsCommand;
import com.agent.cli.cmd.ToolStatsCommand;
import com.agent.cli.client.ApiClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

@Command(
        name = "agent-cli",
        mixinStandardHelpOptions = true,
        version = "0.1.0",
        description = "AI Agent CLI",
        subcommands = {
                LoginCommand.class,
                SessionsCommand.class,
                CreateSessionCommand.class,
                ChatCommand.class,
                StreamChatCommand.class,
                ToolStatsCommand.class,
                ReleaseReportCommand.class,
                ReplCommand.class
        }
)
public class AgentCliApplication implements Runnable {

    @Option(names = "--base-url", description = "Backend base URL")
    String baseUrl;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public ApiClient apiClient() {
        return new ApiClient(resolveBaseUrl(), objectMapper);
    }

    public ObjectMapper objectMapper() {
        return objectMapper;
    }

    private String resolveBaseUrl() {
        if (baseUrl != null && !baseUrl.isBlank()) {
            return baseUrl;
        }
        String preferred = System.getenv("AGENT_API_BASE_URL");
        if (preferred != null && !preferred.isBlank()) {
            return preferred;
        }
        String legacy = System.getenv("AGENT_API_BASE");
        if (legacy != null && !legacy.isBlank()) {
            return legacy;
        }
        return "http://localhost:8080";
    }

    @Override
    public void run() {
        System.out.println("Use --help to see commands.");
    }

    public static void main(String[] args) {
        AgentCliApplication root = new AgentCliApplication();
        CommandLine cmd = new CommandLine(root);
        cmd.setExecutionStrategy(new CommandLine.RunLast());
        int exitCode = cmd.execute(args);
        System.exit(exitCode);
    }
}
