package com.agent.mvp.modelsource;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.AuthenticatedControllerSupport;
import com.agent.mvp.modelsource.dto.CreateModelSourceRequest;
import com.agent.mvp.modelsource.dto.ModelSourceResponse;
import com.agent.mvp.modelsource.dto.ModelSourceTestResponse;
import com.agent.mvp.modelsource.dto.UpdateModelSourceRequest;
import com.agent.mvp.modelsource.service.ModelSourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/model-sources")
@Tag(name = "Knowledge Desk - Model Sources", description = "知识工作台第三方模型源管理接口")
public class ModelSourceController extends AuthenticatedControllerSupport {

    private final ModelSourceService modelSourceService;

    public ModelSourceController(ModelSourceService modelSourceService) {
        this.modelSourceService = modelSourceService;
    }

    @GetMapping
    @Operation(summary = "获取当前用户的模型源列表")
    public List<ModelSourceResponse> list(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.list(user.userId());
    }

    @PostMapping
    @Operation(summary = "创建模型源")
    public ModelSourceResponse create(
            @Valid @RequestBody CreateModelSourceRequest request, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.create(user.userId(), request);
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新模型源")
    public ModelSourceResponse update(
            @PathVariable("id") UUID id,
            @Valid @RequestBody UpdateModelSourceRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.update(user.userId(), id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除模型源")
    public void delete(@PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        modelSourceService.delete(user.userId(), id);
    }

    @PostMapping("/{id}/enable")
    @Operation(summary = "启用模型源")
    public ModelSourceResponse enable(@PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.setEnabled(user.userId(), id, true);
    }

    @PostMapping("/{id}/disable")
    @Operation(summary = "停用模型源")
    public ModelSourceResponse disable(@PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.setEnabled(user.userId(), id, false);
    }

    @PostMapping("/{id}/set-default")
    @Operation(summary = "将模型源设为默认")
    public ModelSourceResponse setDefault(
            @PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.setDefault(user.userId(), id);
    }

    @PostMapping("/{id}/test")
    @Operation(summary = "测试模型源连通性")
    public ModelSourceTestResponse test(@PathVariable("id") UUID id, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelSourceService.test(user.userId(), id);
    }
}
