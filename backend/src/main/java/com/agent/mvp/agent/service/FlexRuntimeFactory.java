package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ResolvedModelConfig;
import com.agent.mvp.agent.tooling.ToolSpec;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import org.flexagent.core.memory.AgentMessage;
import org.flexagent.core.runtime.AgentRuntime;
import org.flexagent.core.runtime.RuntimeTypes;
import org.flexagent.langchain4j.FlexAgentChatModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 负责按用户配置（是否有 customApiKey）决定使用哪个 FlexAgent AgentRuntime，
 * 并将对话历史注入至 runtime。
 *
 * <p>提取自 AgentService，消除跨层依赖（AgentService 不再直接构造 LLM 客户端）。
 */
@Component
public class FlexRuntimeFactory {

    private static final Logger log = LoggerFactory.getLogger(FlexRuntimeFactory.class);

    private final FlexAgentChatModel defaultFlexModel;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    public FlexRuntimeFactory(FlexAgentChatModel defaultFlexModel,
                              AppProperties appProperties,
                              ObjectMapper objectMapper) {
        this.defaultFlexModel = defaultFlexModel;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 根据用户是否配置了自定义 API Key 选择 runtime。
     * 若构建自定义 runtime 失败，则降级到默认 runtime 并打印 error 日志。
     *
     * @param user      当前用户（允许为 null，降级到默认）
     * @param resolved  已解析的模型配置（provider + model）
     * @param toolSpecs 工具规格列表，用于构建自定义 FlexAgentChatModel
     * @return 激活的 AgentRuntime 实例
     */
    public AgentRuntime createRuntime(User user, ResolvedModelConfig resolved, List<ToolSpec> toolSpecs) {
        if (user != null
                && user.getCustomApiKey() != null
                && !user.getCustomApiKey().isBlank()) {
            try {
                return buildCustomRuntime(user, resolved, toolSpecs);
            } catch (Exception e) {
                log.error("Failed to build custom FlexAgentChatModel for user {}, falling back to default", user.getId(), e);
            }
        }
        return defaultFlexModel.activeRuntime();
    }

    /**
     * 将 ModelChatMessage 历史注入到 runtime（无反射，通过 AgentRuntime 接口直接调用）。
     *
     * @param runtime   目标 runtime
     * @param sessionId 会话 ID，用于 runtime 内部关联
     * @param messages  系统消息 + 历史对话消息
     */
    public void injectHistory(AgentRuntime runtime, String sessionId, List<ModelChatMessage> messages) {
        List<AgentMessage> agentMessages = new ArrayList<>(messages.size());
        for (ModelChatMessage m : messages) {
            String content = m.content() == null ? "" : m.content();
            AgentMessage agentMsg = switch (m.role()) {
                case "system"    -> AgentMessage.system(content);
                case "assistant" -> AgentMessage.assistant(content);
                case "tool"      -> AgentMessage.tool(m.toolCallId() != null ? m.toolCallId() : "unknown", m.name() != null ? m.name() : "unknown", content);
                default          -> AgentMessage.user(content);   // "user" mapped to user
            };
            agentMessages.add(agentMsg);
        }
        runtime.setHistoryMessages(agentMessages);
        runtime.setSessionId(sessionId);
    }

    // -------------------------------------------------------------------------

    private AgentRuntime buildCustomRuntime(User user,
                                            ResolvedModelConfig resolved,
                                            List<ToolSpec> toolSpecs) throws Exception {
        String baseUrl = (user.getCustomBaseUrl() != null && !user.getCustomBaseUrl().isBlank())
                ? user.getCustomBaseUrl()
                : appProperties.getOpenai().getBaseUrl();

        ChatLanguageModel customModel = OpenAiChatModel.builder()
                .baseUrl(baseUrl)
                .apiKey(user.getCustomApiKey())
                .modelName(resolved.model())
                .timeout(Duration.ofMillis(appProperties.getModelRuntime().getReadTimeoutMs()))
                .maxRetries(appProperties.getModelRuntime().getIdempotentRetries())
                .build();

        List<Object> tools = new ArrayList<>(toolSpecs.size());
        for (ToolSpec spec : toolSpecs) {
            String schemaJson = objectMapper.writeValueAsString(spec.inputJsonSchema());
            tools.add(new org.flexagent.core.model.ToolDefinition(spec.name(), spec.description(), schemaJson));
        }

        FlexAgentChatModel customFlex = FlexAgentChatModel.builder()
                .runtime(RuntimeTypes.LANGCHAIN4J)
                .model(customModel)
                .tools(tools.toArray())
                .build();

        return customFlex.activeRuntime();
    }
}
