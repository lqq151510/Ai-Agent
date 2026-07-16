package com.agent.mvp.ingestion;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.AuthenticatedControllerSupport;
import com.agent.mvp.ingestion.dto.IngestionJobResponse;
import com.agent.mvp.ingestion.service.IngestionJobService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ingestion-jobs")
@Tag(name = "Knowledge Desk - Ingestion Jobs", description = "知识工作台导入与整理任务流水接口")
public class IngestionJobController extends AuthenticatedControllerSupport {

    private final IngestionJobService ingestionJobService;

    public IngestionJobController(IngestionJobService ingestionJobService) {
        this.ingestionJobService = ingestionJobService;
    }

    @GetMapping
    @Operation(summary = "获取导入与整理任务列表")
    public List<IngestionJobResponse> list(
            @RequestParam(value = "limit", defaultValue = "20") int limit,
            @RequestParam(value = "knowledgeItemId", required = false) UUID knowledgeItemId,
            @RequestParam(value = "jobType", required = false) String jobType,
            @RequestParam(value = "status", required = false) String status,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return ingestionJobService.list(user.userId(), limit, knowledgeItemId, jobType, status);
    }

    @GetMapping("/{id}")
    @Operation(summary = "获取单个任务详情")
    public IngestionJobResponse detail(@PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return ingestionJobService.get(user.userId(), id);
    }
}
