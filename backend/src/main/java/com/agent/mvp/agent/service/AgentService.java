package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.ChatStreamMeta;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.tooling.AgentToolOrchestrator;
import com.agent.mvp.agent.tooling.ToolRunBundle;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.tooling.service.ToolAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

@Service
public class AgentService {

    private static final int CONTEXT_LIMIT = 20;

    private final SessionService sessionService;
    private final ModelRoutingService modelRoutingService;
    private final ModelGateway modelGateway;
    private final AgentToolOrchestrator toolOrchestrator;
    private final ToolAuditService toolAuditService;
    private final ObjectMapper objectMapper;

    public AgentService(SessionService sessionService,
                        ModelRoutingService modelRoutingService,
                        ModelGateway modelGateway,
                        AgentToolOrchestrator toolOrchestrator,
                        ToolAuditService toolAuditService,
                        ObjectMapper objectMapper) {
        this.sessionService = sessionService;
        this.modelRoutingService = modelRoutingService;
        this.modelGateway = modelGateway;
        this.toolOrchestrator = toolOrchestrator;
        this.toolAuditService = toolAuditService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ChatResponse chat(UUID userId, ChatRequest request) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);

        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());

        ToolRunBundle toolBundle = toolOrchestrator.runToolsForMessage(request.message());

        List<ModelChatMessage> messages = buildMessages(sessionService.listRecentMessages(userId, session.getId(), CONTEXT_LIMIT), toolBundle.promptContext());

        ModelChatResponse modelResponse = modelGateway.chat(
                resolved.provider(),
                new ModelChatRequest(resolved.model(), messages)
        );

        String toolTraceJson = "[]";
        try {
            toolTraceJson = objectMapper.writeValueAsString(toolBundle.traces());
        } catch (Exception ignored) {
            // best effort
        }

        sessionService.saveMessage(
                session,
                "assistant",
                modelResponse.content(),
                toolTraceJson,
                resolved.provider().name(),
                resolved.model()
        );

        toolAuditService.saveAll(
                userId,
                session.getId(),
                resolved.provider().name(),
                resolved.model(),
                toolBundle.traces()
        );

        return new ChatResponse(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                modelResponse.content(),
                modelResponse.latencyMs(),
                toolBundle.traces()
        );
    }

    public ChatResponse streamChat(UUID userId,
                                   ChatRequest request,
                                   Consumer<ChatStreamMeta> metaConsumer,
                                   Consumer<String> chunkConsumer) {
        ConversationSession session = sessionService.findOwnedSession(userId, request.sessionId());
        ResolvedModelConfig resolved = modelRoutingService.resolve(request.provider(), request.model(), session);

        sessionService.saveMessage(session, "user", request.message(), null, resolved.provider().name(), resolved.model());

        ToolRunBundle toolBundle = toolOrchestrator.runToolsForMessage(request.message());
        metaConsumer.accept(new ChatStreamMeta(session.getId(), resolved.provider(), resolved.model(), toolBundle.traces()));

        List<ModelChatMessage> messages = buildMessages(sessionService.listRecentMessages(userId, session.getId(), CONTEXT_LIMIT), toolBundle.promptContext());

        ModelChatResponse modelResponse = modelGateway.stream(
                resolved.provider(),
                new ModelChatRequest(resolved.model(), messages),
                chunkConsumer
        );

        String toolTraceJson = "[]";
        try {
            toolTraceJson = objectMapper.writeValueAsString(toolBundle.traces());
        } catch (Exception ignored) {
            // best effort
        }

        sessionService.saveMessage(
                session,
                "assistant",
                modelResponse.content(),
                toolTraceJson,
                resolved.provider().name(),
                resolved.model()
        );

        toolAuditService.saveAll(
                userId,
                session.getId(),
                resolved.provider().name(),
                resolved.model(),
                toolBundle.traces()
        );

        return new ChatResponse(
                session.getId(),
                resolved.provider(),
                resolved.model(),
                modelResponse.content(),
                modelResponse.latencyMs(),
                toolBundle.traces()
        );
    }

    private List<ModelChatMessage> buildMessages(List<MessageResponse> history, String toolContext) {
        List<ModelChatMessage> messages = new ArrayList<>();
        messages.add(new ModelChatMessage(
                "system",
                "You are a Java AI coding assistant. Use provided tool context as factual repo grounding. " +
                        "If tool context is insufficient, say what extra info is needed."
        ));

        List<MessageResponse> sliced = history.size() <= CONTEXT_LIMIT
                ? history
                : history.subList(history.size() - CONTEXT_LIMIT, history.size());

        for (int i = 0; i < sliced.size(); i++) {
            MessageResponse msg = sliced.get(i);
            String content = msg.content();
            if (i == sliced.size() - 1 && "user".equals(msg.role()) && toolContext != null && !toolContext.isBlank()) {
                content = content + "\n\nTool context:\n" + toolContext;
            }
            messages.add(new ModelChatMessage(msg.role(), content));
        }

        return messages;
    }
}
