package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.service.SessionService;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 消息历史处理器，负责从会话中获取历史消息、构建上下文窗口、并分离最后一条用户消息。
 *
 * <p>该组件将原本耦合在 AgentService.executeLoop 中的历史处理逻辑独立出来，便于单独测试和扩展。
 */
@Component
public class MessageHistoryProcessor {

    private final SessionService sessionService;
    private final AgentContextService agentContextService;

    public MessageHistoryProcessor(
            SessionService sessionService, AgentContextService agentContextService) {
        this.sessionService = sessionService;
        this.agentContextService = agentContextService;
    }

    /**
     * 处理消息历史：获取历史、构建上下文窗口、分离最后一条用户消息。
     *
     * <p>最后一条用户消息已由调用方保存并通过 runtime.send() 单独发送， 因此需要从注入的历史中排除，避免在模型上下文中重复。
     *
     * @param userId 用户 ID
     * @param sessionId 会话 ID
     * @param maxContextTokens 最大上下文 token 数
     * @param systemContext 系统上下文
     * @return 处理后的历史结果
     */
    public ProcessedHistory processHistory(
            UUID userId, UUID sessionId, int maxContextTokens, String systemContext) {
        List<MessageResponse> history = sessionService.listMessages(userId, sessionId);
        if (history == null) {
            history = List.of();
        }
        AgentContextService.HistoryWindow historyWindow =
                agentContextService.buildMessages(userId, history, maxContextTokens, systemContext);

        List<ModelChatMessage> messages = historyWindow.messages();
        String lastMessage = "";
        List<ModelChatMessage> historyForRuntime = new ArrayList<>(messages.size());
        for (int i = 0; i < messages.size(); i++) {
            ModelChatMessage msg = messages.get(i);
            boolean isLast = (i == messages.size() - 1);
            if (isLast && "user".equals(msg.role())) {
                lastMessage = msg.content();
            } else {
                historyForRuntime.add(msg);
            }
        }

        return new ProcessedHistory(historyForRuntime, lastMessage, historyWindow);
    }

    /** 处理后的历史结果。 */
    public record ProcessedHistory(
            List<ModelChatMessage> historyForRuntime,
            String lastMessage,
            AgentContextService.HistoryWindow historyWindow) {}
}
