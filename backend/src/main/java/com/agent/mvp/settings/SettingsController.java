package com.agent.mvp.settings;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.AuthenticatedControllerSupport;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.dto.ErrorResponse;
import com.agent.mvp.settings.dto.SettingsBackupPayload;
import com.agent.mvp.settings.dto.SettingsImportResponse;
import com.agent.mvp.settings.dto.SettingsProfileResponse;
import com.agent.mvp.settings.dto.SettingsStorageResponse;
import com.agent.mvp.settings.dto.UpdateSettingsProfileRequest;
import com.agent.mvp.settings.service.SettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/settings")
@Tag(name = "Knowledge Desk - Settings", description = "知识工作台个人中心与账户设置接口")
public class SettingsController extends AuthenticatedControllerSupport {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping("/profile")
    @Operation(summary = "获取个人资料与模型偏好")
    public SettingsProfileResponse profile(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return settingsService.getProfile(user.userId());
    }

    @PutMapping("/profile")
    @Operation(summary = "更新个人资料与模型偏好")
    public SettingsProfileResponse updateProfile(
            @Valid @RequestBody UpdateSettingsProfileRequest request,
            Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return settingsService.updateProfile(user.userId(), request);
    }

    @GetMapping("/storage")
    @Operation(summary = "获取知识工作台存储概览")
    public SettingsStorageResponse storage(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return settingsService.getStorage(user.userId());
    }

    @GetMapping(value = "/export", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "导出本机知识库 JSON 备份")
    public SettingsBackupPayload exportBackup(Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return settingsService.exportBackup(user.userId());
    }

    @PostMapping(
            value = "/import",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "合并导入本机知识库 JSON 备份")
    public SettingsImportResponse importBackup(
            @Valid @RequestBody SettingsBackupPayload request, Authentication authentication) {
        AuthenticatedUser user = requireAuthenticatedUser(authentication);
        return settingsService.importBackup(user.userId(), request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleMalformedSettingsJson(
            HttpMessageNotReadableException exception) {
        return ResponseEntity.badRequest()
                .body(
                        new ErrorResponse(
                                "BAD_REQUEST",
                                "Malformed settings JSON",
                                RequestContext.ensureRequestId(),
                                Instant.now()));
    }
}
