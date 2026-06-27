package com.agent.mvp.system;

import com.agent.mvp.system.dto.ModelsResponse;
import com.agent.mvp.system.dto.ReadinessResponse;
import com.agent.mvp.system.service.SystemDiagnosticsService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/system")
public class SystemController {

    private final SystemDiagnosticsService diagnosticsService;

    public SystemController(SystemDiagnosticsService diagnosticsService) {
        this.diagnosticsService = diagnosticsService;
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/models")
    public ModelsResponse models() {
        return diagnosticsService.listModels();
    }

    @GetMapping("/health/ready")
    public ReadinessResponse ready() {
        return diagnosticsService.readiness();
    }
}
