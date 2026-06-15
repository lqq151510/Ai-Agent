package com.agent.mvp.agent;

import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.context.RequestContext;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/agent/memory")
public class MemoryController {

    private final RAGMemoryService ragMemoryService;

    public MemoryController(RAGMemoryService ragMemoryService) {
        this.ragMemoryService = ragMemoryService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list(Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            List<Map<String, Object>> memories = ragMemoryService.listAllMemories(user.userId());
            return ResponseEntity.ok(memories);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> update(
            @PathVariable("id") String id,
            @RequestBody Map<String, String> body,
            Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            String text = body.get("text");
            if (text == null || text.trim().isEmpty()) {
                return ResponseEntity.badRequest().build();
            }
            ragMemoryService.updateMemory(id, text.trim());
            return ResponseEntity.ok().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") String id, Authentication authentication) {
        AuthenticatedUser user = com.agent.mvp.auth.security.AuthUtils.requireUser(authentication);
        try (MDC.MDCCloseable u = MDC.putCloseable(RequestContext.USER_ID_KEY, user.userId().toString())) {
            ragMemoryService.deleteMemory(id);
            return ResponseEntity.ok().build();
        }
    }
}
