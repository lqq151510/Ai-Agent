package com.agent.mvp.session.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.UserService;
import com.agent.mvp.common.dto.PageResult;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.SessionCacheService;
import com.agent.mvp.session.dto.CreateSessionRequest;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.dto.SessionExportResponse;
import com.agent.mvp.session.dto.SessionResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.entity.Message;
import com.agent.mvp.session.repo.ConversationSessionRepository;
import com.agent.mvp.session.repo.MessageRepository;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SessionService {

    private final ConversationSessionRepository sessionRepository;
    private final MessageRepository messageRepository;
    private final UserService userService;
    private final AppProperties appProperties;
    private final SessionCacheService cacheService;

    public SessionService(
            ConversationSessionRepository sessionRepository,
            MessageRepository messageRepository,
            UserService userService,
            AppProperties appProperties,
            SessionCacheService cacheService) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.userService = userService;
        this.appProperties = appProperties;
        this.cacheService = cacheService;
    }

    @Transactional
    public SessionResponse createSession(UUID userId, CreateSessionRequest request) {
        User user =
                Optional.ofNullable(userService.getUserById(userId))
                        .orElseThrow(() -> new NotFoundException("User not found"));

        ModelProviderType provider =
                request.provider() != null
                        ? request.provider()
                        : appProperties.getDefaultProvider();
        String model = request.model();
        if (model == null || model.isBlank()) {
            model = appProperties.getDefaultModel(provider);
        }

        String title = request.title();
        if (title == null || title.isBlank()) {
            title =
                    "Session "
                            + DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                                    .format(LocalDateTime.now());
        }

        ConversationSession session = new ConversationSession();
        session.setUserId(user.getId());
        session.setTitle(title);
        session.setProvider(provider);
        session.setModel(model);
        session.setTaskType(normalizeTaskType(request.taskType()));
        session.setTaskGoal(normalizeTaskGoal(request.taskGoal()));
        session.setTaskStatus(normalizeTaskStatus(request.taskStatus()));
        session.setContextTokenLimit(request.contextTokenLimit());

        return toResponse(saveSession(session));
    }

    @Transactional(readOnly = true)
    public PageResult<SessionResponse> listSessions(UUID userId, int page, int size) {
        Page<ConversationSession> sessionPage =
                sessionRepository.selectPage(
                        new Page<>(Math.max(1, page + 1), Math.max(1, size)),
                        new LambdaQueryWrapper<ConversationSession>()
                                .eq(ConversationSession::getUserId, userId)
                                .orderByDesc(ConversationSession::getUpdatedAt));
        List<SessionResponse> content =
                sessionPage.getRecords().stream().map(this::toResponse).toList();
        return new PageResult<>(
                content,
                ((int) sessionPage.getCurrent() - 1),
                (int) sessionPage.getSize(),
                sessionPage.getTotal(),
                (int) sessionPage.getPages());
    }

    @Transactional
    public SessionResponse updateContextTokenLimit(
            UUID userId, UUID sessionId, Integer contextTokenLimit) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        session.setContextTokenLimit(contextTokenLimit);
        return toResponse(saveSession(session));
    }

    @Transactional
    public SessionResponse updateWorkflow(
            UUID userId, UUID sessionId, String taskType, String taskGoal, String taskStatus) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        session.setTaskType(normalizeTaskType(taskType));
        session.setTaskGoal(normalizeTaskGoal(taskGoal));
        session.setTaskStatus(normalizeTaskStatus(taskStatus));
        return toResponse(saveSession(session));
    }

    @Transactional(readOnly = true)
    public ConversationSession findOwnedSession(UUID userId, UUID sessionId) {
        return Optional.ofNullable(
                        sessionRepository.selectOne(
                                new LambdaQueryWrapper<ConversationSession>()
                                        .eq(ConversationSession::getId, sessionId)
                                        .eq(ConversationSession::getUserId, userId)))
                .orElseThrow(
                        () -> new ForbiddenException("Session does not exist or no permission"));
    }

    /**
     * 统计当前活跃会话数。
     *
     * <p>活跃定义：最近 24 小时内有更新的会话数量。供 Prometheus Gauge 指标 {@code
     * agent.sessions.active} 使用。
     *
     * @return 活跃会话数
     */
    @Transactional(readOnly = true)
    public long countActiveSessions() {
        Instant since = Instant.now().minus(java.time.Duration.ofHours(24));
        return sessionRepository.selectCount(
                new LambdaQueryWrapper<ConversationSession>()
                        .ge(ConversationSession::getUpdatedAt, since));
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> listMessages(UUID userId, UUID sessionId) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        return cacheService
                .getCachedMessages(session.getId())
                .orElseGet(
                        () -> {
                            List<MessageResponse> data =
                                    messageRepository
                                            .selectList(
                                                    new LambdaQueryWrapper<Message>()
                                                            .eq(
                                                                    Message::getSessionId,
                                                                    session.getId())
                                                            .orderByAsc(Message::getCreatedAt))
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
        return messageRepository
                .selectPage(
                        new Page<>(1, Math.max(1, limit)),
                        new LambdaQueryWrapper<Message>()
                                .eq(Message::getSessionId, session.getId())
                                .orderByDesc(Message::getCreatedAt))
                .getRecords()
                .stream()
                .sorted(Comparator.comparing(Message::getCreatedAt))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public SessionExportResponse exportSession(UUID userId, UUID sessionId) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        List<MessageResponse> messages =
                messageRepository
                        .selectList(
                                new LambdaQueryWrapper<Message>()
                                        .eq(Message::getSessionId, session.getId())
                                        .orderByAsc(Message::getCreatedAt))
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
        out.append("- Provider/Model: ")
                .append(session.provider())
                .append("/")
                .append(session.model())
                .append("\n");
        out.append("- Task Type: ").append(session.taskType()).append("\n");
        out.append("- Task Goal: ")
                .append(session.taskGoal() == null ? "-" : session.taskGoal())
                .append("\n");
        out.append("- Task Status: ").append(session.taskStatus()).append("\n");
        out.append("- Created At: ").append(session.createdAt()).append("\n");
        out.append("- Updated At: ").append(session.updatedAt()).append("\n");
        out.append("- Exported At: ").append(exported.exportedAt()).append("\n\n");
        out.append("## Messages\n\n");

        for (MessageResponse message : exported.messages()) {
            out.append("### ")
                    .append(message.role())
                    .append(" @ ")
                    .append(message.createdAt())
                    .append("\n\n");
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
    public void deleteSession(UUID userId, UUID sessionId) {
        ConversationSession session = findOwnedSession(userId, sessionId);
        messageRepository.delete(
                new LambdaQueryWrapper<Message>().eq(Message::getSessionId, session.getId()));
        sessionRepository.deleteById(session.getId());
        cacheService.evictMessages(session.getId());
    }

    @Transactional
    public Message saveMessage(
            ConversationSession session,
            String role,
            String content,
            String toolTrace,
            String provider,
            String model) {
        Message message = new Message();
        message.setSessionId(session.getId());
        message.setRole(role);
        message.setContent(content);
        message.setToolTrace(toolTrace);
        message.setProvider(provider);
        message.setModel(model);

        Message saved = saveMessage(message);
        cacheService.evictMessages(session.getId());

        session.setUpdatedAt(Instant.now());
        saveSession(session);

        return saved;
    }

    private SessionResponse toResponse(ConversationSession session) {
        return new SessionResponse(
                session.getId(),
                session.getTitle(),
                session.getProvider(),
                session.getModel(),
                normalizeTaskType(session.getTaskType()),
                session.getTaskGoal(),
                normalizeTaskStatus(session.getTaskStatus()),
                session.getContextTokenLimit(),
                session.getCreatedAt(),
                session.getUpdatedAt());
    }

    private MessageResponse toResponse(Message message) {
        return new MessageResponse(
                message.getId(),
                message.getRole(),
                message.getContent(),
                message.getToolTrace(),
                message.getProvider(),
                message.getModel(),
                message.getCreatedAt());
    }

    private ConversationSession saveSession(ConversationSession session) {
        if (session.getId() == null) {
            session.onCreate();
            sessionRepository.insert(session);
        } else {
            session.onUpdate();
            sessionRepository.updateById(session);
        }
        return session;
    }

    private Message saveMessage(Message message) {
        if (message.getId() == null) {
            message.onCreate();
            messageRepository.insert(message);
        } else {
            messageRepository.updateById(message);
        }
        return message;
    }

    private String normalizeTaskType(String taskType) {
        if (taskType == null || taskType.isBlank()) {
            return "chat";
        }
        return taskType.trim();
    }

    private String normalizeTaskGoal(String taskGoal) {
        if (taskGoal == null || taskGoal.isBlank()) {
            return null;
        }
        return taskGoal.trim();
    }

    private String normalizeTaskStatus(String taskStatus) {
        if (taskStatus == null || taskStatus.isBlank()) {
            return "planned";
        }
        return taskStatus.trim();
    }
}
