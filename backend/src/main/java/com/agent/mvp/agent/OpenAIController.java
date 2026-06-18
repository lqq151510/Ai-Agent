package com.agent.mvp.agent;

import com.agent.mvp.agent.dto.ChatRequest;
import com.agent.mvp.agent.dto.ChatResponse;
import com.agent.mvp.agent.dto.OpenAIChatRequest;
import com.agent.mvp.agent.dto.OpenAIMessage;
import com.agent.mvp.agent.service.AgentService;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.exception.TooManyRequestsException;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.repo.ConversationSessionRepository;
import com.agent.mvp.session.service.SessionService;
import com.agent.mvp.agent.ModelProviderType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

import java.util.UUID;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/openai/v1")
@CrossOrigin(origins = "*", maxAge = 3600)
public class OpenAIController {

    private static final Logger log = LoggerFactory.getLogger(OpenAIController.class);

    private final AgentService agentService;
    private final SessionService sessionService;
    private final ConversationSessionRepository sessionRepository;
    private final ThreadPoolTaskExecutor streamExecutor;
    private final ObjectMapper objectMapper;
    private final AtomicInteger inFlightStreams = new AtomicInteger();

    public OpenAIController(
            AgentService agentService,
            SessionService sessionService,
            ConversationSessionRepository sessionRepository,
            ThreadPoolTaskExecutor streamExecutor,
            ObjectMapper objectMapper) {
        this.agentService = agentService;
        this.sessionService = sessionService;
        this.sessionRepository = sessionRepository;
        this.streamExecutor = streamExecutor;
        this.objectMapper = objectMapper;
    }

    @PostMapping(value = "/chat/completions", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamCompletions(
            @RequestBody OpenAIChatRequest request, Authentication authentication) {

        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        if (inFlightStreams.get() >= 50) {
            throw new TooManyRequestsException("Too many concurrent stream requests");
        }

        SseEmitter emitter = new SseEmitter(300_000L); // 5 minutes timeout
        
        // Parse OpenAI messages
        List<OpenAIMessage> messages = request.messages();
        String systemContext = "";
        String lastUserMessage = "";
        
        if (messages != null && !messages.isEmpty()) {
            // Extract system context
            systemContext = messages.stream()
                .filter(m -> "system".equals(m.role()))
                .map(OpenAIMessage::content)
                .collect(Collectors.joining("\n"));
                
            // Extract last user message
            for (int i = messages.size() - 1; i >= 0; i--) {
                if ("user".equals(messages.get(i).role())) {
                    lastUserMessage = messages.get(i).content();
                    break;
                }
            }
        }

        final UUID sessionId = UUID.randomUUID();
        final String sysCtx = systemContext;
        final String userMsg = lastUserMessage.isEmpty() ? " " : lastUserMessage;
        
        // Setup temporary session in DB so AgentService can process history if needed
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(user.userId());
        session.setTitle("OpenAI API Chat");
        session.setProvider(ModelProviderType.OPENAI);
        session.setModel(request.model());
        sessionRepository.insert(session);
        
        // Insert previous history (excluding system & last message) into DB
        if (messages != null) {
            boolean foundLastUser = false;
            for (int i = messages.size() - 1; i >= 0; i--) {
                OpenAIMessage m = messages.get(i);
                if ("system".equals(m.role())) continue;
                if (!foundLastUser && "user".equals(m.role())) {
                    foundLastUser = true;
                    continue; // Skip the last user message, it's passed in ChatRequest
                }
                sessionService.saveMessage(session, m.role(), m.content(), null, "OPENAI", request.model());
            }
        }

        emitter.onCompletion(inFlightStreams::decrementAndGet);
        emitter.onTimeout(() -> {
            inFlightStreams.decrementAndGet();
            emitter.complete();
        });
        emitter.onError(e -> {
            inFlightStreams.decrementAndGet();
            log.error("SSE stream error", e);
        });

        inFlightStreams.incrementAndGet();
        streamExecutor.execute(
                () -> {
                    try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString());
                         MDC.MDCCloseable s = MDC.putCloseable(RequestContext.SESSION_ID_KEY, sessionId.toString())) {

                        ChatRequest chatReq = new ChatRequest(
                                sessionId,
                                userMsg,
                                null,
                                request.model(),
                                null,
                                sysCtx,
                                null,
                                null,
                                null
                        );

                        try {
                            agentService.streamChat(
                                    user.userId(),
                                    chatReq,
                                    meta -> {},
                                    chunk -> sendOpenAIChunk(emitter, chunk),
                                    call -> {}
                            );
                            sendOpenAIDone(emitter);
                            emitter.complete();
                        } catch (Exception ex) {
                            log.error("Agent execution failed", ex);
                            emitter.completeWithError(ex);
                        }
                    }
                });

        return emitter;
    }

    private void sendOpenAIChunk(SseEmitter emitter, String chunk) {
        try {
            ObjectNode root = objectMapper.createObjectNode();
            root.put("id", "chatcmpl-" + UUID.randomUUID().toString());
            root.put("object", "chat.completion.chunk");
            root.put("created", System.currentTimeMillis() / 1000);
            root.put("model", "gpt-4");
            
            ArrayNode choices = root.putArray("choices");
            ObjectNode choice = choices.addObject();
            choice.put("index", 0);
            
            ObjectNode delta = choice.putObject("delta");
            delta.put("content", chunk);
            
            emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(root)));
        } catch (Exception ignore) {
        }
    }

    private void sendOpenAIDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().data("[DONE]"));
        } catch (Exception ignore) {
        }
    }
}
