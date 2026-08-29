package com.agent.mvp.settings;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.AuthenticatedControllerSupport;
import com.agent.mvp.modelsource.dto.UserMetricsResponse;
import com.agent.mvp.modelsource.service.ModelUsageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/user/metrics")
@Tag(name = "User Metrics", description = "用户个人中心真实数据看板与 Token 统计")
public class UserMetricsController extends AuthenticatedControllerSupport {

    private final ModelUsageService modelUsageService;

    public UserMetricsController(ModelUsageService modelUsageService) {
        this.modelUsageService = modelUsageService;
    }

    @GetMapping
    @Operation(summary = "获取当前用户的真实数据指标与 Token 用量看板")
    public UserMetricsResponse getMetrics(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return modelUsageService.getMetrics(user.userId());
    }
}
