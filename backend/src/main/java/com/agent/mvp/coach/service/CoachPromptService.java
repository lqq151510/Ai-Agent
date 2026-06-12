package com.agent.mvp.coach.service;

import com.agent.mvp.agent.dto.ModelChatMessage;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CoachPromptService {

    public List<ModelChatMessage> requirementMessages(String requirement) {
        return List.of(
                ModelChatMessage.of(
                        "system",
                        """
You are an AI + Java development coach for students.
Return strict JSON only. No markdown, no code fence.
Schema:
{
  "goal": "string",
  "modules": [{"name":"string","description":"string"}],
  "dataStructures": [{"name":"string","description":"string"}],
  "apiEndpoints": [{"method":"GET|POST|PUT|DELETE","path":"string","purpose":"string"}],
  "risks": [{"name":"string","description":"string"}],
  "testPoints": ["string"]
}
Keep the output practical for Spring Boot, AI Agent, RAG, and Java project work.
"""),
                ModelChatMessage.of("user", requirement));
    }

    public List<ModelChatMessage> logDiagnosisMessages(String logContent, String context) {
        String prompt = "Context:\n" + safe(context) + "\n\nLog:\n" + logContent;
        return List.of(
                ModelChatMessage.of(
                        "system",
                        """
You are a senior Java/Spring Boot debugging assistant.
Return strict JSON only. No markdown, no code fence.
Schema:
{
  "symptom": "string",
  "rootCause": "string",
  "triggerCondition": "string",
  "minimalFix": "string",
  "verificationSteps": ["string"]
}
The answer must focus on root cause, minimal diff, and repeatable verification.
"""),
                ModelChatMessage.of("user", prompt));
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "No extra context provided." : value;
    }
}
