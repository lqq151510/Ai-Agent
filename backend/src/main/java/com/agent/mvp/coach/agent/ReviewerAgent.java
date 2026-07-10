package com.agent.mvp.coach.agent;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import org.springframework.stereotype.Component;

import java.util.List;

@org.springframework.context.annotation.Profile("legacy")
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

    public String reviewPlan(String requirement, String plan) {
        ModelChatRequest request = new ModelChatRequest(
                "gpt-4o",
                List.of(
                        ModelChatMessage.of("system", "You are an expert Code Reviewer Agent. Your job is to review the proposed development plan for feasibility, scope, and engineering logic. " +
                                "If the plan is good, feasible, and ready for code generation, you MUST start your response with '[APPROVED]'. " +
                                "If you find logic flaws, missing modules, or design risks, you MUST start your response with '[REJECTED]' followed by a list of constructive feedback and improvement suggestions."),
                        ModelChatMessage.of("user", String.format("Original Requirement: %s\n\nProposed Plan:\n%s", requirement, plan))
                ),
                null, null, null, null
        );

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        return response.content();
    }
}
