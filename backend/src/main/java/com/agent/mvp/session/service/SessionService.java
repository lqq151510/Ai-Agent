package com.agent.mvp.session.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.repo.UserRepository;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RedisSessionCacheService;
import com.agent.mvp.session.dto.CreateSessionRequest;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.dto.SessionExportResponse;
import com.agent.mvp.session.dto.SessionResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.entity.Message;
import com.agent.mvp.session.repo.ConversationSessionRepository;
import com.agent.mvp.session.repo.MessageRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

@Service
public class SessionService {

    private final ConversationSessionRepository sessionRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final AppProperties appProperties;
    private final RedisSessionCacheService cacheService;

    public SessionService(ConversationSessionRepository sessionRepository,
                          MessageRepository messageRepository,
                          UserRepository userRepository,
                          AppProperties appProperties,
                          RedisSessionCacheService cacheService) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.appProperties = appProperties;
        this.cacheService = cacheService;
    }

    @Transactional
    public SessionResponse createSession(UUID userId, CreateSessionRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        ModelProviderType provider = request.provider() != null ? request.provider() : appProperties.getDefaultProvider();
        String model = request.model();
        if (model == null || model.isBlank()) {
            model = appProperties.getDefaultOpenaiModel();
        }

        String title = request.title();
        if (title == null || title.isBlank()) {
            title = "Session " + DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").format(LocalDateTime.now());
        }

        ConversationSession session = new ConversationSession();
        session.setUser(user);
        session.setTitle(title);
        session.setProvider(provider);
        session.setModel(model);

        return toResponse(sessionRepository.save(session));
    }

    @Transactional(readOnly = true)
    public List<SessionResponse> listSessions(UUID userId) {
        return sessionRepository.findByUser_IdOrderByUpdatedAtDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ConversationSession findOwnedSession(UUID userId, UUID sessionId) {
        return sessionRepository.findByIdAndUser_Id(sessionId, userId)
                .orElseThrow(() -> new ForbiddenException("Session does not exist or no permission"));
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> listMessages(UUID userId, UUID sessionId) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        return cacheService.getCachedMessages(session.getId())
                .orElseGet(() -> {
                    List<MessageResponse> data = messageRepository.findBySessionIdOrderByCreatedAtAsc(session.getId())
                            .stream()
                            .map(this::toResponse)
                            .toList();
                    cacheService.cacheMessages(session.getId(), data);
                    return data;
                });
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> listRecentMessages(UUID userId, UUID sessionId, int limit) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        return messageRepository.findBySessionIdOrderByCreatedAtDesc(
                        session.getId(),
                        PageRequest.of(0, Math.max(1, limit))
                )
                .stream()
                .sorted(Comparator.comparing(Message::getCreatedAt))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public SessionExportResponse exportSession(UUID userId, UUID sessionId) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        List<MessageResponse> messages = messageRepository.findBySessionIdOrderByCreatedAtAsc(session.getId())
                .stream()
                .map(this::toResponse)
                .toList();
        return new SessionExportResponse(toResponse(session), messages, Instant.now());
    }

    @Transactional(readOnly = true)
    public String exportSessionMarkdown(UUID userId, UUID sessionId) {
        SessionExportResponse exported = exportSession(userId, sessionId);
        StringBuilder out = new StringBuilder();
        SessionResponse session = exported.session();

        out.append("# ").append(session.title()).append("\n\n");
        out.append("- Session ID: ").append(session.id()).append("\n");
        out.append("- Provider/Model: ").append(session.provider()).append("/").append(session.model()).append("\n");
        out.append("- Created At: ").append(session.createdAt()).append("\n");
        out.append("- Updated At: ").append(session.updatedAt()).append("\n");
        out.append("- Exported At: ").append(exported.exportedAt()).append("\n\n");
        out.append("## Messages\n\n");

        for (MessageResponse message : exported.messages()) {
            out.append("### ").append(message.role()).append(" @ ").append(message.createdAt()).append("\n\n");
            out.append(message.content()).append("\n\n");
            if (message.toolTrace() != null && !message.toolTrace().isBlank()) {
                out.append("```json\n");
                out.append(message.toolTrace()).append("\n");
                out.append("```\n\n");
            }
        }

        return out.toString();
    }

    @Transactional
    public Message saveMessage(ConversationSession session,
                               String role,
                               String content,
                               String toolTrace,
                               String provider,
                               String model) {
        Message message = new Message();
        message.setSession(session);
        message.setRole(role);
        message.setContent(content);
        message.setToolTrace(toolTrace);
        message.setProvider(provider);
        message.setModel(model);

        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);

        Message saved = messageRepository.save(message);
        cacheService.evictMessages(session.getId());
        return saved;
    }

    private SessionResponse toResponse(ConversationSession session) {
        return new SessionResponse(
                session.getId(),
                session.getTitle(),
                session.getProvider(),
                session.getModel(),
                session.getCreatedAt(),
                session.getUpdatedAt()
        );
    }

    private MessageResponse toResponse(Message message) {
        return new MessageResponse(
                message.getId(),
                message.getRole(),
                message.getContent(),
                message.getToolTrace(),
                message.getProvider(),
                message.getModel(),
                message.getCreatedAt()
        );
    }
}
