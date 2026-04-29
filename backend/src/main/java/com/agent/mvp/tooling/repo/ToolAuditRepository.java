package com.agent.mvp.tooling.repo;

import com.agent.mvp.tooling.entity.ToolAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ToolAuditRepository extends JpaRepository<ToolAudit, UUID> {
    List<ToolAudit> findByUserIdAndCreatedAtAfterOrderByCreatedAtDesc(UUID userId, Instant createdAt);

    List<ToolAudit> findByUserIdAndSessionIdAndCreatedAtAfterOrderByCreatedAtDesc(UUID userId, UUID sessionId, Instant createdAt);
}
