package com.agent.mvp.knowledge;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.AuthenticatedControllerSupport;
import com.agent.mvp.knowledge.review.KnowledgeReviewService;
import com.agent.mvp.knowledge.review.dto.CompleteKnowledgeReviewRequest;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewQueueResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewStateResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewSummaryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Knowledge Desk - Reviews", description = "知识工作台本机间隔复习接口")
public class KnowledgeReviewController extends AuthenticatedControllerSupport {

    private final KnowledgeReviewService knowledgeReviewService;

    public KnowledgeReviewController(KnowledgeReviewService knowledgeReviewService) {
        this.knowledgeReviewService = knowledgeReviewService;
    }

    @GetMapping("/knowledge-reviews/queue")
    @Operation(summary = "获取每日回顾队列")
    public KnowledgeReviewQueueResponse queue(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeReviewService.getQueue(user.userId(), limit);
    }

    @PostMapping("/knowledge-reviews/{itemId}/complete")
    @Operation(summary = "提交知识条目的回顾反馈")
    public KnowledgeReviewStateResponse complete(
            @PathVariable("itemId") UUID itemId,
            @Valid @RequestBody CompleteKnowledgeReviewRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeReviewService.complete(user.userId(), itemId, request);
    }

    @GetMapping("/knowledge-reviews/summary")
    @Operation(summary = "获取每日回顾摘要")
    public KnowledgeReviewSummaryResponse summary(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeReviewService.getSummary(user.userId());
    }
}
