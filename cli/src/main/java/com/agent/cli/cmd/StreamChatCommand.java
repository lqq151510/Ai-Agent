package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import com.fasterxml.jackson.core.type.TypeReference;
import picocli.CommandLine;

import java.net.ConnectException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

@CommandLine.Command(name = "stream-chat", description = "Send a chat message and stream response")
public class StreamChatCommand implements Runnable {

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

    private static final String[] SPINNER = {"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"};

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
        payload.put("systemContext", com.agent.cli.context.ContextCollector.collectContext());
        if (provider != null && !provider.isBlank()) {
            payload.put("provider", provider);
        }
        if (model != null && !model.isBlank()) {
            payload.put("model", model);
        }

        long startNs = System.nanoTime();
        AtomicBoolean started = new AtomicBoolean(false);
        AtomicReference<String> streamError = new AtomicReference<>();
        AtomicReference<String> doneData = new AtomicReference<>();
        AtomicLong firstTokenMs = new AtomicLong(-1);
        AtomicInteger spinnerIdx = new AtomicInteger(0);

        System.out.println("\u001B[36m[status] connecting to session " + sid.substring(0, 8) + "...\u001B[0m");

        try {
            root.apiClient().streamAuthenticated("/api/v1/agent/chat/stream", payload, state, store, (event, data) -> {
                switch (event) {
                    case "meta" -> {
                        System.out.print("\033[2K\r");
                        printMeta(data);
                    }
                    case "chunk" -> {
                        if (!started.get()) {
                            long elapsedMs = elapsedMs(startNs);
                            firstTokenMs.set(elapsedMs);
                            System.out.print("\033[2K\r"); // Clear spinner
                            System.out.print("\u001B[36massistant>\u001B[0m ");
                            started.set(true);
                        }
                        System.out.print(data);
                        System.out.flush();
                    }
                    case "heartbeat" -> {
                        if (!started.get()) {
                            String frame = SPINNER[spinnerIdx.getAndIncrement() % SPINNER.length];
                            System.out.print("\033[2K\r\u001B[33m" + frame + " Thinking & executing tools...\u001B[0m");
                            System.out.flush();
                        }
                    }
                    case "done" -> doneData.set(data);
                    case "error" -> streamError.set(extractError(data));
                    default -> {
                        // ignore heartbeat/unknown events
                    }
                }
            });
        } catch (RuntimeException ex) {
            System.err.println("\033[2K\rstream failed: " + normalizeTransportError(ex));
            return;
        }

        if (started.get()) {
            System.out.println();
        }

        if (streamError.get() != null) {
            System.err.println("stream failed: " + normalizeStreamError(streamError.get()));
            return;
        }

        if (doneData.get() != null && !doneData.get().isBlank()) {
            printDoneSummary(doneData.get(), started.get(), firstTokenMs.get(), startNs);
        }
    }

    private void printMeta(String raw) {
        try {
            Map<String, Object> payload = root.objectMapper().readValue(raw, new TypeReference<>() {});
            System.out.printf("[meta] provider=%s model=%s%n", payload.get("provider"), payload.get("model"));
        } catch (Exception ignored) {
            // Best effort metadata parsing.
        }
    }

    private String extractError(String raw) {
        try {
            Map<String, Object> payload = root.objectMapper().readValue(raw, new TypeReference<>() {});
            Object message = payload.get("message");
            if (message != null && !String.valueOf(message).isBlank()) {
                return String.valueOf(message);
            }
        } catch (Exception ignored) {
            // Fall back to raw payload.
        }
        return raw;
    }

    private void printDoneSummary(String raw, boolean started, long firstTokenMs, long startNs) {
        try {
            Map<String, Object> payload = root.objectMapper().readValue(raw, new TypeReference<>() {});
            Object elapsedMs = payload.get("elapsedMs");
            Object usedProvider = payload.get("provider");
            Object usedModel = payload.get("model");
            Object reply = payload.get("reply");

            if (!started && reply != null && !String.valueOf(reply).isBlank()) {
                System.out.println("assistant> " + reply);
            }

            if (elapsedMs != null || usedProvider != null || usedModel != null) {
                long totalElapsed = elapsedMs instanceof Number
                        ? ((Number) elapsedMs).longValue()
                        : elapsedMs(startNs);
                String firstToken = firstTokenMs > 0 ? String.valueOf(firstTokenMs) : "-";
                System.out.printf("[done] provider=%s model=%s firstTokenMs=%s totalMs=%d%n",
                        usedProvider,
                        usedModel,
                        firstToken,
                        totalElapsed);
            }
        } catch (Exception ignored) {
            // Summary is optional.
        }
    }

    private String normalizeStreamError(String raw) {
        String text = raw == null ? "" : raw;
        String lower = text.toLowerCase();
        if (lower.contains("too many") || lower.contains("429")) {
            return "请求过于频繁，请稍后重试，或降低并发。";
        }
        if (lower.contains("token") || lower.contains("authentication") || lower.contains("unauthorized")) {
            return "登录状态失效，请先执行 login。";
        }
        if (lower.contains("connect") || lower.contains("timeout") || lower.contains("model")) {
            return "模型服务不可达或超时，请检查 MODEL_PROVIDER / OPENAI_BASE_URL / 模型状态。";
        }
        return text;
    }

    private String normalizeTransportError(RuntimeException ex) {
        String message = ex.getMessage() == null ? "" : ex.getMessage();
        String lower = message.toLowerCase();
        if (lower.contains("401") || lower.contains("authentication") || lower.contains("unauthorized")) {
            return "鉴权失败，请重新执行 login。";
        }
        if (lower.contains("429") || lower.contains("too many")) {
            return "触发限流，请稍后重试。";
        }
        if (hasCause(ex, ConnectException.class) || lower.contains("connect")) {
            return "无法连接后端，请检查 --base-url、后端服务和网络。";
        }
        if (lower.contains("timeout")) {
            return "请求超时，请稍后重试或检查模型服务负载。";
        }
        return message.isBlank() ? "请求失败，请检查后端与模型服务状态。" : message;
    }

    private boolean hasCause(Throwable ex, Class<?> type) {
        Throwable current = ex;
        while (current != null) {
            if (type.isInstance(current)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private long elapsedMs(long startNs) {
        return (System.nanoTime() - startNs) / 1_000_000L;
    }

    private void ensureLoggedIn(AuthState state) {
        if (state.getAccessToken() == null || state.getAccessToken().isBlank()) {
            throw new RuntimeException("Please login first.");
        }
    }
}
