package com.agent.mvp.service;

import com.agent.mvp.tools.OsControlTools;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import org.springframework.stereotype.Service;

@Service
public class OsAgentService {

    interface OsAgent {
        @SystemMessage({
            "You are an advanced OS Agent running on macOS.",
            "Your objective is to help the user complete tasks on their computer by using your"
                    + " terminal execution tool.",
            "Always think step-by-step. If you need to read a file, execute a command to read it"
                    + " first.",
            "If a command fails, read the error output and try an alternative approach."
        })
        String chat(String userMessage);
    }

    private final OsAgent agent;

    public OsAgentService(ChatLanguageModel vertexAiChatModel, OsControlTools tools) {
        this.agent =
                AiServices.builder(OsAgent.class)
                        .chatLanguageModel(vertexAiChatModel)
                        .chatMemory(MessageWindowChatMemory.withMaxMessages(20))
                        .tools(tools)
                        .build();
    }

    public String chatWithAgent(String message) {
        return agent.chat(message);
    }
}
