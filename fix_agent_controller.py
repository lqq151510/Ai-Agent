import re

with open("backend/src/main/java/com/agent/mvp/agent/AgentController.java", "r") as f:
    content = f.read()

# Replace imports
content = re.sub(r'import reactor\.core\.publisher\.Flux;\n', '', content)
content = re.sub(r'import org\.springframework\.http\.codec\.ServerSentEvent;\n', 'import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;\n', content)

# Replace the stream method
old_stream_pattern = r'@PostMapping\(value = "/chat/stream".*?private void enforceChatRateLimit'

new_stream = """@PostMapping(value = "/chat/stream", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody ChatRequest request,
                             Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        enforceChatRateLimit(user);

        SseEmitter emitter = new SseEmitter(0L);

        long heartbeatMs = Math.max(1_000L, appProperties.getAgent().getHeartbeatIntervalMs());
        ScheduledFuture<?> heartbeat = heartbeatScheduler.getScheduledExecutor().scheduleAtFixedRate(
                () -> {
                    try {
                        emitter.send(SseEmitter.event().name("heartbeat").data(Map.of("ts", Instant.now().toString())));
                    } catch (Exception e) {
                        // ignore
                    }
                },
                heartbeatMs,
                heartbeatMs,
                TimeUnit.MILLISECONDS
        );

        Runnable cleanup = () -> heartbeat.cancel(true);
        emitter.onCompletion(cleanup);
        emitter.onError(e -> cleanup.run());
        emitter.onTimeout(cleanup);

        try {
            inFlightStreams.incrementAndGet();
            streamExecutor.execute(() -> {
                try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
                     MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, request.sessionId().toString())) {
                    try {
                        ChatResponse response = agentService.streamChat(
                                user.userId(),
                                request,
                                meta -> sendSseEvent(emitter, "meta", meta),
                                chunk -> sendSseEvent(emitter, "chunk", chunk),
                                call -> sendSseEvent(emitter, "client_tool_call", call)
                        );
                        sendSseEvent(emitter, "done", response);
                        emitter.complete();
                    } catch (Exception ex) {
                        if (!isClientDisconnect(ex)) {
                            try {
                                sendSseEvent(emitter, "error", Map.of("message", errorMessage(ex)));
                            } catch (Exception ignore) {}
                        }
                        emitter.completeWithError(ex);
                    }
                } finally {
                    inFlightStreams.decrementAndGet();
                    cleanup.run();
                }
            });
        } catch (RejectedExecutionException ex) {
            cleanup.run();
            rejectedStreams.incrementAndGet();
            inFlightStreams.decrementAndGet();
            throw new TooManyRequestsException("Too many concurrent stream requests");
        }

        return emitter;
    }

    private void sendSseEvent(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void enforceChatRateLimit"""

content = re.sub(old_stream_pattern, new_stream, content, flags=re.DOTALL)

with open("backend/src/main/java/com/agent/mvp/agent/AgentController.java", "w") as f:
    f.write(content)
print("AgentController SseEmitter Fixed")
