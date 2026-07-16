package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class AgentContextService {

    private static final int MIN_CONTEXT_TOKENS = 500;
    private static final int MAX_CONTEXT_TOKENS = 200_000;
    private final RAGMemoryService ragMemoryService;
    private final AppProperties appProperties;

    public AgentContextService(RAGMemoryService ragMemoryService, AppProperties appProperties) {
        this.ragMemoryService = ragMemoryService;
        this.appProperties = appProperties;
    }

    public int resolveContextTokenBudget(
            Integer userProvidedMaxContextTokens, ConversationSession session) {
        int budget;
        if (userProvidedMaxContextTokens != null) {
            budget = userProvidedMaxContextTokens;
        } else if (session != null && session.getContextTokenLimit() != null) {
            budget = session.getContextTokenLimit();
        } else {
            budget = appProperties.getAgent().getMaxContextTokens();
        }
        return Math.max(MIN_CONTEXT_TOKENS, Math.min(budget, MAX_CONTEXT_TOKENS));
    }

    public HistoryWindow buildMessages(
            UUID userId,
            List<MessageResponse> history,
            int maxContextTokens,
            String systemContext) {
        maxContextTokens =
                Math.max(MIN_CONTEXT_TOKENS, Math.min(maxContextTokens, MAX_CONTEXT_TOKENS));
        List<ModelChatMessage> messages = new ArrayList<>();

        String lastUserMessage = "";
        if (history != null && !history.isEmpty()) {
            MessageResponse lastMsg = history.get(history.size() - 1);
            if ("user".equals(lastMsg.role())) {
                lastUserMessage = lastMsg.content();
            }
        }

        List<String> similarDiagnoses = List.of();
        if (lastUserMessage != null && !lastUserMessage.isBlank()) {
            similarDiagnoses = ragMemoryService.searchSimilarDiagnoses(userId, lastUserMessage, 3);
        }

        StringBuilder systemPrompt =
                new StringBuilder(
                        "You are a Java AI coding assistant. Use provided tool context as factual"
                                + " repo grounding. If tool context is insufficient, say what extra"
                                + " info is needed.");

        if (!similarDiagnoses.isEmpty()) {
            systemPrompt.append(
                    "\n\nHere are some relevant historical log diagnoses for reference:\n");
            for (String diagnosis : similarDiagnoses) {
                systemPrompt.append("---\n").append(diagnosis).append("\n");
            }
            systemPrompt.append("---\n");
        }

        int currentPromptTokens = TokenCounter.countTokens(systemPrompt.toString());
        int systemContextBudget = Math.max(0, maxContextTokens - currentPromptTokens - 500);

        String sanitizedSystemContext = sanitizeSystemContext(systemContext, systemContextBudget);
        if (!sanitizedSystemContext.isBlank()) {
            systemPrompt.append("\n\n# Dynamic Context\n").append(sanitizedSystemContext);
        }

        String promptText = systemPrompt.toString();
        messages.add(ModelChatMessage.of("system", promptText));

        int historyBudget =
                Math.max(0, maxContextTokens - TokenCounter.countTokens(promptText) - 8);
        HistoryWindow historyWindow = sliceByTokenBudget(history, historyBudget);
        messages.addAll(historyWindow.messages());

        return new HistoryWindow(
                messages, historyWindow.historyMessagesUsed(), historyWindow.historyTruncated());
    }

    private HistoryWindow sliceByTokenBudget(List<MessageResponse> history, int maxTokens) {
        if (history == null || history.isEmpty()) {
            return new HistoryWindow(List.of(), 0, false);
        }
        List<ModelChatMessage> reversed = new ArrayList<>();
        int budget = Math.max(0, maxTokens);
        int used = 0;
        boolean truncated = false;
        for (int i = history.size() - 1; i >= 0; i--) {
            MessageResponse msg = history.get(i);
            if (msg == null) {
                continue;
            }
            String role = msg.role() == null ? "" : msg.role();
            String content = msg.content() == null ? "" : msg.content();
            int messageTokens =
                    TokenCounter.countTokens(role) + TokenCounter.countTokens(content) + 8;
            if (used + messageTokens > budget && !reversed.isEmpty()) {
                truncated = true;
                break;
            }
            used += messageTokens;
            reversed.add(ModelChatMessage.of(role, content));
        }
        Collections.reverse(reversed);
        return new HistoryWindow(reversed, reversed.size(), truncated);
    }

    private String sanitizeSystemContext(String systemContext, int tokenBudget) {
        if (systemContext == null || systemContext.isBlank()) {
            return "";
        }

        String[] lines = systemContext.replace("\r\n", "\n").split("\n");
        StringBuilder sb = new StringBuilder();
        java.util.regex.Pattern sensitivePattern =
                java.util.regex.Pattern.compile(
                        "(?i)(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)");

        for (String line : lines) {
            if (sensitivePattern.matcher(line).find()) {
                sb.append("[redacted sensitive line]\n");
            } else {
                sb.append(line).append("\n");
            }
        }
        String sanitized = sb.toString();

        sanitized =
                sanitized
                        .replaceAll("Bearer\\s+[A-Za-z0-9._-]+", "Bearer [redacted]")
                        .replaceAll("(?i)sk-[A-Za-z0-9]+", "sk-[redacted]")
                        .replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E]", "")
                        .replaceAll("\\n{3,}", "\\n\\n")
                        .trim();

        int currentTokens = TokenCounter.countTokens(sanitized);
        if (currentTokens > tokenBudget) {
            double ratio = (double) tokenBudget / currentTokens;
            int estimatedSafeLength = (int) (sanitized.length() * ratio * 0.95);
            sanitized = sanitized.substring(0, Math.max(0, estimatedSafeLength)).trim();
            while (!sanitized.isBlank() && TokenCounter.countTokens(sanitized) > tokenBudget) {
                sanitized = sanitized.substring(0, Math.max(0, sanitized.length() - 50)).trim();
            }
        }

        return sanitized;
    }

    public record HistoryWindow(
            List<ModelChatMessage> messages, int historyMessagesUsed, boolean historyTruncated) {}
}
