package com.agent.mvp.coach.agent;

import com.agent.mvp.coach.event.PlanProposedEvent;
import com.agent.mvp.coach.event.PlanReviewedEvent;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
public class SupervisorAgent {

    private static final Logger log = LoggerFactory.getLogger(SupervisorAgent.class);

    private final PlannerAgent plannerAgent;
    private final CoderAgent coderAgent;
    private final ReviewerAgent reviewerAgent;
    private final ApplicationEventPublisher eventPublisher;

    public SupervisorAgent(
            PlannerAgent plannerAgent,
            CoderAgent coderAgent,
            ReviewerAgent reviewerAgent,
            ApplicationEventPublisher eventPublisher) {
        this.plannerAgent = plannerAgent;
        this.coderAgent = coderAgent;
        this.reviewerAgent = reviewerAgent;
        this.eventPublisher = eventPublisher;
    }

    public String executeTask(String requirement) {
        return executeTask(UUID.randomUUID(), requirement);
    }

    /**
     * 执行多智能体任务，使用指定 runId 作为代码生成沙箱隔离标识。
     *
     * @param runId       沙箱运行 ID，CoderAgent 会将生成代码写入 {@code workspace/coach-runs/{runId}/}
     * @param requirement 用户需求文本
     * @return 多智能体辩论与生成结果汇总
     */
    public String executeTask(UUID runId, String requirement) {
        log.info(
                "Supervisor: Starting multi-agent task execution. runId={}, Requirement: {}",
                runId,
                requirement);

        StringBuilder debateLog = new StringBuilder();
        debateLog.append("### 🤖 多智能体协同辩论历程 (Multi-Agent Debate History)\n\n");

        log.info("Supervisor: Requesting initial plan from PlannerAgent...");
        String currentPlan = plannerAgent.plan(requirement);
        log.info("Supervisor: Initial plan generated.");

        int round = 1;
        boolean approved = false;
        int maxRounds = 3;

        while (round <= maxRounds && !approved) {
            debateLog.append(String.format("#### 🔄 Round %d\n\n", round));
            debateLog.append("- **PlannerAgent 提出的开发计划草案**:\n").append(currentPlan).append("\n\n");

            // 1. 发布 PlanProposedEvent
            log.info("Supervisor: Publishing PlanProposedEvent for round {}", round);
            eventPublisher.publishEvent(new PlanProposedEvent(this, round, requirement, currentPlan));

            // 2. 调用 ReviewerAgent 对计划进行评审
            log.info("Supervisor: Calling ReviewerAgent to review the plan...");
            String reviewResult = reviewerAgent.reviewPlan(requirement, currentPlan);
            
            // 解析 Review 结果
            boolean isApproved = reviewResult.contains("[APPROVED]");
            String feedback = reviewResult.replace("[APPROVED]", "").replace("[REJECTED]", "").trim();

            debateLog.append("- **ReviewerAgent 审查结论**: ")
                     .append(isApproved ? "✅ 同意 (Approved)" : "❌ 驳回 (Rejected)")
                     .append("\n- **修改意见/反馈**: \n")
                     .append(feedback.isEmpty() ? "计划设计合理，准予执行代码生成。" : feedback)
                     .append("\n\n");

            // 3. 发布 PlanReviewedEvent
            log.info("Supervisor: Publishing PlanReviewedEvent for round {}", round);
            eventPublisher.publishEvent(new PlanReviewedEvent(this, round, isApproved, feedback));

            if (isApproved) {
                approved = true;
                log.info("Supervisor: Plan approved in round {}.", round);
            } else {
                log.warn("Supervisor: Plan rejected in round {}. Requesting refinement...", round);
                round++;
                if (round <= maxRounds) {
                    currentPlan = plannerAgent.replan(requirement, currentPlan, feedback);
                } else {
                    log.warn("Supervisor: Reached maximum debate rounds ({}). Proceeding with fallback plan.", maxRounds);
                    debateLog.append("> [!WARNING]\n")
                             .append("> 已达最大辩论轮次上限（3轮），将使用最新版本的开发计划进行代码生成。\n\n");
                }
            }
        }

        log.info("Supervisor: Proceeding to CoderAgent with the final plan... runId={}", runId);
        String code = coderAgent.code(runId, currentPlan);
        log.info("Supervisor: Code generation completed.");

        log.info("Supervisor: Proceeding to ReviewerAgent for code quality review...");
        String codeReview = reviewerAgent.review(code);
        log.info("Supervisor: Code review completed.");

        return debateLog.toString() + 
               "--- \n\n### 💻 最终执行计划 (Final Approved Plan)\n\n" + currentPlan + 
               "\n\n--- \n\n### 📦 生成的代码 (Generated Source Code)\n\n" + code + 
               "\n\n--- \n\n### 🔍 代码质量评估 (Code Quality Review)\n\n" + codeReview;
    }
}
