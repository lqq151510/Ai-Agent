package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import picocli.CommandLine;

import java.util.List;
import java.util.Map;

@CommandLine.Command(
        name = "release-report",
        mixinStandardHelpOptions = true,
        description = "Generate release readiness report"
)
public class ReleaseReportCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @CommandLine.Option(names = "--window-hours", defaultValue = "24", description = "Stats window in hours (1-168)")
    private int windowHours;

    @CommandLine.Option(names = "--session", description = "Optional session ID filter")
    private String sessionId;

    @CommandLine.Option(names = "--json", description = "Print JSON report")
    private boolean json;

    @CommandLine.Option(names = "--markdown", description = "Print markdown report")
    private boolean markdown;

    @Override
    public void run() {
        if (json && markdown) {
            throw new RuntimeException("Choose either --json or --markdown, not both.");
        }

        CliStateStore store = new CliStateStore(root.objectMapper());
        AuthState state = store.read();
        ensureLoggedIn(state);

        int safeWindow = Math.max(1, Math.min(168, windowHours));
        String query = "windowHours=" + safeWindow;
        if (sessionId != null && !sessionId.isBlank()) {
            query += "&sessionId=" + sessionId.trim();
        }

        if (markdown) {
            String payload = root.apiClient().getStringAuthenticated(
                    "/api/system/release-report/export?" + query + "&format=markdown",
                    state,
                    store
            );
            System.out.println(payload);
            return;
        }

        Map<String, Object> report = root.apiClient().getAuthenticated(
                "/api/system/release-report?" + query,
                state,
                store
        );

        if (json) {
            try {
                System.out.println(root.objectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(report));
            } catch (Exception ex) {
                throw new RuntimeException("Failed to print JSON: " + ex.getMessage(), ex);
            }
            return;
        }

        printSummary(report);
    }

    private void printSummary(Map<String, Object> report) {
        System.out.printf("[release-report] window=%sh generatedAt=%s%n",
                String.valueOf(report.get("windowHours")),
                String.valueOf(report.get("generatedAt")));

        Object readinessObj = report.get("readiness");
        if (readinessObj instanceof Map<?, ?> readiness) {
            System.out.printf("readiness: ready=%s%n", String.valueOf(readiness.get("ready")));
        }

        Object modelsObj = report.get("models");
        if (modelsObj instanceof Map<?, ?> models) {
            System.out.printf("models: default=%s/%s%n",
                    String.valueOf(models.get("defaultProvider")),
                    String.valueOf(models.get("defaultModel")));
        }

        Object toolStatsObj = report.get("toolStats");
        if (toolStatsObj instanceof Map<?, ?> stats) {
            System.out.printf("toolStats: total=%s successRate=%s%% p95=%sms%n",
                    String.valueOf(stats.get("totalRuns")),
                    String.valueOf(stats.get("successRate")),
                    String.valueOf(stats.get("p95DurationMs")));

            Object topToolsObj = stats.get("topTools");
            if (topToolsObj instanceof List<?> tools && !tools.isEmpty()) {
                System.out.println("top tools:");
                for (Object item : tools) {
                    if (item instanceof Map<?, ?> map) {
                        System.out.printf("- %s | runs=%s | success=%s%%%n",
                                String.valueOf(map.get("toolName")),
                                String.valueOf(map.get("runs")),
                                String.valueOf(map.get("successRate")));
                    }
                }
            }
        }
    }

    private void ensureLoggedIn(AuthState state) {
        if (state.getAccessToken() == null || state.getAccessToken().isBlank()) {
            throw new RuntimeException("Please login first.");
        }
    }
}
