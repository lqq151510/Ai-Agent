package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import picocli.CommandLine;

import java.util.List;
import java.util.Map;

@CommandLine.Command(
        name = "tool-stats",
        mixinStandardHelpOptions = true,
        description = "Show or export tool execution statistics"
)
public class ToolStatsCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @CommandLine.Option(names = "--window-hours", defaultValue = "24", description = "Stats window in hours (1-168)")
    private int windowHours;

    @CommandLine.Option(names = "--session", description = "Optional session ID filter")
    private String sessionId;

    @CommandLine.Option(names = "--json", description = "Print raw JSON")
    private boolean json;

    @CommandLine.Option(names = "--markdown", description = "Print markdown export")
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
                    "/api/system/tool-stats/export?" + query + "&format=markdown",
                    state,
                    store
            );
            System.out.println(payload);
            return;
        }

        Map<String, Object> stats = root.apiClient().getAuthenticated(
                "/api/system/tool-stats?" + query,
                state,
                store
        );

        if (json) {
            try {
                System.out.println(root.objectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(stats));
            } catch (Exception ex) {
                throw new RuntimeException("Failed to print JSON: " + ex.getMessage(), ex);
            }
            return;
        }

        printSummary(stats);
    }

    private void printSummary(Map<String, Object> stats) {
        System.out.printf("[tool-stats] window=%sh total=%s success=%s failed=%s successRate=%s%% avg=%sms p95=%sms%n",
                asInt(stats.get("windowHours")),
                asLong(stats.get("totalRuns")),
                asLong(stats.get("successRuns")),
                asLong(stats.get("failedRuns")),
                asDouble(stats.get("successRate")),
                asLong(stats.get("averageDurationMs")),
                asLong(stats.get("p95DurationMs")));

        Object bucketsObj = stats.get("durationBuckets");
        if (bucketsObj instanceof List<?> buckets && !buckets.isEmpty()) {
            System.out.println("duration buckets:");
            for (Object item : buckets) {
                if (item instanceof Map<?, ?> map) {
                    System.out.printf("- %s: %s%n", String.valueOf(map.get("label")), String.valueOf(map.get("count")));
                }
            }
        }

        Object topToolsObj = stats.get("topTools");
        if (topToolsObj instanceof List<?> tools && !tools.isEmpty()) {
            System.out.println("top tools:");
            for (Object item : tools) {
                if (item instanceof Map<?, ?> map) {
                    System.out.printf("- %s | runs=%s | success=%s%% | avg=%sms | p95=%sms%n",
                            String.valueOf(map.get("toolName")),
                            String.valueOf(map.get("runs")),
                            String.valueOf(map.get("successRate")),
                            String.valueOf(map.get("averageDurationMs")),
                            String.valueOf(map.get("p95DurationMs")));
                }
            }
        }
    }

    private int asInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }

    private long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }

    private String asDouble(Object value) {
        if (value instanceof Number number) {
            return String.format("%.1f", number.doubleValue());
        }
        return String.valueOf(value);
    }

    private void ensureLoggedIn(AuthState state) {
        if (state.getAccessToken() == null || state.getAccessToken().isBlank()) {
            throw new RuntimeException("Please login first.");
        }
    }
}
