package com.agent.mvp.agent.tooling;

import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ClientToolRegistry {
    private final Map<String, CompletableFuture<String>> pending = new ConcurrentHashMap<>();

    public CompletableFuture<String> register(String callId) {
        CompletableFuture<String> future = new CompletableFuture<>();
        pending.put(callId, future);
        return future;
    }

    public void complete(String callId, String result) {
        CompletableFuture<String> future = pending.remove(callId);
        if (future != null) {
            future.complete(result);
        }
    }
}
