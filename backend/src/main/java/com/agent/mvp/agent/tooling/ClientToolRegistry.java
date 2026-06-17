package com.agent.mvp.agent.tooling;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class ClientToolRegistry {
    private final Map<String, CompletableFuture<String>> pending = new ConcurrentHashMap<>();

    public CompletableFuture<String> register(String userId, String callId) {
        CompletableFuture<String> future = new CompletableFuture<>();
        String key = userId + ":" + callId;
        CompletableFuture<String> existing = pending.put(key, future);
        if (existing != null) {
            existing.completeExceptionally(
                    new IllegalStateException("Duplicate client tool registration: " + key));
        }
        return future;
    }

    public void complete(String userId, String callId, String result) {
        CompletableFuture<String> future = pending.remove(userId + ":" + callId);
        if (future != null) {
            future.complete(result);
        }
    }

    public void remove(String userId, String callId) {
        pending.remove(userId + ":" + callId);
    }
}
