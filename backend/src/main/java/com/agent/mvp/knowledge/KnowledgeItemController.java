package com.agent.mvp.knowledge;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.AuthenticatedControllerSupport;
import com.agent.mvp.knowledge.dto.BatchOrganizeResponse;
import com.agent.mvp.knowledge.dto.CreateTagRequest;
import com.agent.mvp.knowledge.dto.DashboardSummaryResponse;
import com.agent.mvp.knowledge.dto.ImportFileKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.ImportSnippetKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.ImportWebKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.KnowledgeItemPageResponse;
import com.agent.mvp.knowledge.dto.KnowledgeItemResponse;
import com.agent.mvp.knowledge.dto.TagResponse;
import com.agent.mvp.knowledge.dto.UpdateKnowledgeItemRequest;
import com.agent.mvp.knowledge.service.KnowledgeItemService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Knowledge Desk - Knowledge Items", description = "知识工作台资料导入、整理、检索与标签接口")
public class KnowledgeItemController extends AuthenticatedControllerSupport {

    private final KnowledgeItemService knowledgeItemService;

    public KnowledgeItemController(KnowledgeItemService knowledgeItemService) {
        this.knowledgeItemService = knowledgeItemService;
    }

    @PostMapping("/knowledge-items/import/web")
    @Operation(summary = "导入网页资料到收集箱")
    public KnowledgeItemResponse importWeb(
            @Valid @RequestBody ImportWebKnowledgeItemRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.importWeb(user.userId(), request);
    }

    @PostMapping("/knowledge-items/import/file")
    @Operation(summary = "导入本地文件资料到收集箱")
    public KnowledgeItemResponse importFile(
            @Valid @RequestBody ImportFileKnowledgeItemRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.importFile(user.userId(), request);
    }

    @PostMapping(value = "/knowledge-items/import/upload", consumes = "multipart/form-data")
    @Operation(summary = "上传并解析本地文档到收集箱")
    public KnowledgeItemResponse importUpload(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.importUpload(user.userId(), file, title);
    }

    @PostMapping("/knowledge-items/import/snippet")
    @Operation(summary = "导入手动片段到收集箱")
    public KnowledgeItemResponse importSnippet(
            @Valid @RequestBody ImportSnippetKnowledgeItemRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.importSnippet(user.userId(), request);
    }

    @GetMapping("/knowledge-items")
    @Operation(summary = "分页获取知识条目列表")
    public KnowledgeItemPageResponse listItems(
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "sourceType", required = false) String sourceType,
            @RequestParam(value = "tag", required = false) String tag,
            @RequestParam(value = "page", defaultValue = "1") long page,
            @RequestParam(value = "pageSize", defaultValue = "20") long pageSize,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.listItems(
                user.userId(), status, sourceType, tag, page, pageSize);
    }

    @GetMapping("/knowledge-items/search")
    @Operation(summary = "搜索知识条目")
    public KnowledgeItemPageResponse search(
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "tag", required = false) String tag,
            @RequestParam(value = "sourceType", required = false) String sourceType,
            @RequestParam(value = "from", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                    Instant from,
            @RequestParam(value = "to", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                    Instant to,
            @RequestParam(value = "page", defaultValue = "1") long page,
            @RequestParam(value = "pageSize", defaultValue = "20") long pageSize,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.search(
                user.userId(), query, tag, sourceType, from, to, page, pageSize);
    }

    @GetMapping("/knowledge-items/{id}")
    @Operation(summary = "获取知识条目详情")
    public KnowledgeItemResponse detail(
            @PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.getItem(user.userId(), id);
    }

    @PutMapping("/knowledge-items/{id}")
    @Operation(summary = "更新知识条目元信息")
    public KnowledgeItemResponse update(
            @PathVariable("id") UUID id,
            @Valid @RequestBody UpdateKnowledgeItemRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.updateItem(user.userId(), id, request);
    }

    @PostMapping("/knowledge-items/{id}/organize")
    @Operation(summary = "整理知识条目并生成摘要、标签")
    public KnowledgeItemResponse organize(
            @PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.organize(user.userId(), id);
    }

    @PostMapping("/knowledge-items/organize-batch")
    @Operation(summary = "批量整理收集箱或失败条目")
    public BatchOrganizeResponse organizeBatch(
            @RequestParam(value = "limit", defaultValue = "20") int limit,
            @RequestParam(value = "includeFailed", defaultValue = "false") boolean includeFailed,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.organizeBatch(user.userId(), limit, includeFailed);
    }

    @PostMapping("/knowledge-items/{id}/reprocess")
    @Operation(summary = "重新整理单个知识条目")
    public KnowledgeItemResponse reprocess(
            @PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.reprocess(user.userId(), id);
    }

    @PostMapping("/knowledge-items/{id}/archive")
    @Operation(summary = "归档知识条目")
    public KnowledgeItemResponse archive(
            @PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.archive(user.userId(), id);
    }

    @PostMapping("/knowledge-items/{id}/restore")
    @Operation(summary = "恢复已归档知识条目")
    public KnowledgeItemResponse restore(
            @PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.restore(user.userId(), id);
    }

    @GetMapping("/tags")
    @Operation(summary = "获取标签列表")
    public List<TagResponse> listTags(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.listTags(user.userId());
    }

    @PostMapping("/tags")
    @Operation(summary = "创建自定义标签")
    public TagResponse createTag(
            @Valid @RequestBody CreateTagRequest request, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.createTag(user.userId(), request);
    }

    @GetMapping("/dashboard/summary")
    @Operation(summary = "获取首页摘要数据")
    public DashboardSummaryResponse dashboard(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return knowledgeItemService.dashboardSummary(user.userId());
    }
}
