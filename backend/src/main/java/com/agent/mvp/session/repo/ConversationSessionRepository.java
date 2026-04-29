package com.agent.mvp.session.repo;

import com.agent.mvp.session.entity.ConversationSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationSessionRepository extends JpaRepository<ConversationSession, UUID> {

    List<ConversationSession> findByUser_IdOrderByUpdatedAtDesc(UUID userId);

    Optional<ConversationSession> findByIdAndUser_Id(UUID id, UUID userId);
}
