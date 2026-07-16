package com.agent.mvp.session.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

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
import com.agent.mvp.session.dto.SessionResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.session.entity.Message;
import com.agent.mvp.session.repo.ConversationSessionRepository;
import com.agent.mvp.session.repo.MessageRepository;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SessionServiceTest {

    @Mock private ConversationSessionRepository sessionRepository;

    @Mock private MessageRepository messageRepository;

    @Mock private UserService userService;

    @Mock private SessionCacheService cacheService;

    private AppProperties appProperties;
    private SessionService sessionService;

    @BeforeEach
    void setUp() {
        appProperties = new AppProperties();
        sessionService =
                new SessionService(
                        sessionRepository,
                        messageRepository,
                        userService,
                        appProperties,
                        cacheService);
    }

    @Test
    void testCreateSessionUserNotFound() {
        UUID userId = UUID.randomUUID();
        CreateSessionRequest request =
                new CreateSessionRequest(null, null, null, null, null, null, null);
        when(userService.getUserById(userId)).thenReturn(null);

        assertThatThrownBy(() -> sessionService.createSession(userId, request))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("User not found");
    }

    @Test
    void testCreateSessionSuccessWithDefaults() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);

        CreateSessionRequest request =
                new CreateSessionRequest(null, null, null, null, null, null, null);
        when(userService.getUserById(userId)).thenReturn(user);

        when(sessionRepository.insert(any(ConversationSession.class)))
                .thenAnswer(
                        invocation -> {
                            ConversationSession session = invocation.getArgument(0);
                            session.setId(UUID.randomUUID());
                            return 1;
                        });

        SessionResponse response = sessionService.createSession(userId, request);

        assertThat(response).isNotNull();
        assertThat(response.title()).startsWith("Session ");
        assertThat(response.provider()).isEqualTo(appProperties.getDefaultProvider());
        assertThat(response.model())
                .isEqualTo(appProperties.getDefaultModel(appProperties.getDefaultProvider()));
        assertThat(response.taskType()).isEqualTo("chat");
        assertThat(response.taskStatus()).isEqualTo("planned");
    }

    @Test
    void testCreateSessionSuccessWithCustomValues() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);

        CreateSessionRequest request =
                new CreateSessionRequest(
                        "Custom Title",
                        ModelProviderType.VERTEXAI,
                        "gemini-test-model",
                        "custom-task",
                        "custom-goal",
                        "custom-status",
                        1000);

        when(userService.getUserById(userId)).thenReturn(user);
        when(sessionRepository.insert(any(ConversationSession.class)))
                .thenAnswer(
                        invocation -> {
                            ConversationSession session = invocation.getArgument(0);
                            session.setId(UUID.randomUUID());
                            return 1;
                        });

        SessionResponse response = sessionService.createSession(userId, request);

        assertThat(response.title()).isEqualTo("Custom Title");
        assertThat(response.provider()).isEqualTo(ModelProviderType.VERTEXAI);
        assertThat(response.model()).isEqualTo("gemini-test-model");
        assertThat(response.taskType()).isEqualTo("custom-task");
        assertThat(response.taskGoal()).isEqualTo("custom-goal");
        assertThat(response.taskStatus()).isEqualTo("custom-status");
        assertThat(response.contextTokenLimit()).isEqualTo(1000);
    }

    @Test
    void testListSessions() {
        UUID userId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setTitle("Session Title");

        when(sessionRepository.selectPage(any(Page.class), any(Wrapper.class)))
                .thenAnswer(
                        invocation -> {
                            Page<ConversationSession> page = invocation.getArgument(0);
                            page.setRecords(List.of(session));
                            page.setTotal(1);
                            return page;
                        });

        PageResult<SessionResponse> result = sessionService.listSessions(userId, 0, 10);

        assertThat(result.content()).hasSize(1);
        assertThat(result.content().get(0).title()).isEqualTo("Session Title");
        assertThat(result.totalElements()).isEqualTo(1);
    }

    @Test
    void testUpdateContextTokenLimitSuccess() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);

        SessionResponse response = sessionService.updateContextTokenLimit(userId, sessionId, 2000);

        assertThat(session.getContextTokenLimit()).isEqualTo(2000);
        verify(sessionRepository).updateById(session);
        assertThat(response.contextTokenLimit()).isEqualTo(2000);
    }

    @Test
    void testUpdateWorkflowSuccess() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);

        SessionResponse response =
                sessionService.updateWorkflow(userId, sessionId, "code", "write tests", "running");

        assertThat(session.getTaskType()).isEqualTo("code");
        assertThat(session.getTaskGoal()).isEqualTo("write tests");
        assertThat(session.getTaskStatus()).isEqualTo("running");
        verify(sessionRepository).updateById(session);
    }

    @Test
    void testFindOwnedSessionThrowsForbidden() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(null);

        assertThatThrownBy(() -> sessionService.findOwnedSession(userId, sessionId))
                .isInstanceOf(ForbiddenException.class)
                .hasMessage("Session does not exist or no permission");
    }

    @Test
    void testCountActiveSessions() {
        when(sessionRepository.selectCount(any(Wrapper.class))).thenReturn(5L);

        long count = sessionService.countActiveSessions();

        assertThat(count).isEqualTo(5L);
    }

    @Test
    void testListMessagesCacheHit() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);

        MessageResponse msgResponse =
                new MessageResponse(
                        UUID.randomUUID(), "user", "hello", null, null, null, Instant.now());

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);
        when(cacheService.getCachedMessages(sessionId))
                .thenReturn(Optional.of(List.of(msgResponse)));

        List<MessageResponse> result = sessionService.listMessages(userId, sessionId);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).content()).isEqualTo("hello");
        verifyNoInteractions(messageRepository);
    }

    @Test
    void testListMessagesCacheMiss() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setSessionId(sessionId);
        message.setRole("assistant");
        message.setContent("hi");

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);
        when(cacheService.getCachedMessages(sessionId)).thenReturn(Optional.empty());
        when(messageRepository.selectList(any(Wrapper.class))).thenReturn(List.of(message));

        List<MessageResponse> result = sessionService.listMessages(userId, sessionId);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).content()).isEqualTo("hi");
        verify(cacheService).cacheMessages(eq(sessionId), anyList());
    }

    @Test
    void testListRecentMessages() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setSessionId(sessionId);
        message.setRole("user");
        message.setContent("test content");
        message.setCreatedAt(Instant.now());

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);
        when(messageRepository.selectPage(any(Page.class), any(Wrapper.class)))
                .thenAnswer(
                        invocation -> {
                            Page<Message> page = invocation.getArgument(0);
                            page.setRecords(List.of(message));
                            return page;
                        });

        List<MessageResponse> result = sessionService.listRecentMessages(userId, sessionId, 5);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).content()).isEqualTo("test content");
    }

    @Test
    void testExportSessionMarkdown() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);
        session.setTitle("Markdown Session");
        session.setProvider(ModelProviderType.OPENAI);
        session.setModel("gpt-4");
        session.setTaskType("chat");
        session.setTaskGoal("write code");
        session.setTaskStatus("completed");

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setSessionId(sessionId);
        message.setRole("user");
        message.setContent("hello agent");
        message.setToolTrace("{\"tool\": \"run\"}");
        message.setCreatedAt(Instant.now());

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);
        when(messageRepository.selectList(any(Wrapper.class))).thenReturn(List.of(message));

        String markdown = sessionService.exportSessionMarkdown(userId, sessionId);

        assertThat(markdown).contains("Markdown Session");
        assertThat(markdown).contains("gpt-4");
        assertThat(markdown).contains("write code");
        assertThat(markdown).contains("hello agent");
        assertThat(markdown).contains("tool");
    }

    @Test
    void testDeleteSession() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ConversationSession session = new ConversationSession();
        session.setId(sessionId);
        session.setUserId(userId);

        when(sessionRepository.selectOne(any(Wrapper.class))).thenReturn(session);

        sessionService.deleteSession(userId, sessionId);

        verify(messageRepository).delete(any(Wrapper.class));
        verify(sessionRepository).deleteById(sessionId);
        verify(cacheService).evictMessages(sessionId);
    }

    @Test
    void testSaveMessageNew() {
        ConversationSession session = new ConversationSession();
        session.setId(UUID.randomUUID());

        when(messageRepository.insert(any(Message.class)))
                .thenAnswer(
                        invocation -> {
                            Message message = invocation.getArgument(0);
                            message.setId(UUID.randomUUID());
                            return 1;
                        });

        Message saved =
                sessionService.saveMessage(session, "user", "body", "trace", "openai", "model");

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getContent()).isEqualTo("body");
        verify(cacheService).evictMessages(session.getId());
        verify(sessionRepository).updateById(session);
    }

    @Test
    void testSaveMessageExisting() {
        ConversationSession session = new ConversationSession();
        session.setId(UUID.randomUUID());

        Message existing = new Message();
        existing.setId(UUID.randomUUID());
        existing.setSessionId(session.getId());

        Message saved =
                sessionService.saveMessage(
                        session,
                        existing.getRole(),
                        existing.getContent(),
                        existing.getToolTrace(),
                        existing.getProvider(),
                        existing.getModel());

        verify(messageRepository).insert(any(Message.class));
    }
}
