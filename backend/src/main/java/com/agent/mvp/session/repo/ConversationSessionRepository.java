package com.agent.mvp.session.repo;

import com.agent.mvp.session.entity.ConversationSession;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ConversationSessionRepository extends JpaRepository<ConversationSession, UUID> {

    Page<ConversationSession> findByUser_IdOrderByUpdatedAtDesc(UUID userId, org.springframework.data.domain.Pageable pageable);

    Optional<ConversationSession> findByIdAndUser_Id(UUID id, UUID userId);
}
