package com.agent.mvp.coach.agent;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ReviewerAgent {

    private final ModelGateway modelGateway;

    public ReviewerAgent(ModelGateway modelGateway) {
        this.modelGateway = modelGateway;
    }

    public String review(String code) {
        ModelChatRequest request = new ModelChatRequest(
                "gpt-4o",
                List.of(
                        ModelChatMessage.of("system", "You are an expert Code Reviewer Agent. Review the provided code for bugs, best practices, and code quality. Provide constructive feedback."),
                        ModelChatMessage.of("user", code)
                ),
                null, null, null, null
        );

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        return response.content();
    }
}
