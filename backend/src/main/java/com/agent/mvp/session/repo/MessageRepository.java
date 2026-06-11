package com.agent.mvp.session.repo;

import com.agent.mvp.session.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    List<Message> findBySessionIdOrderByCreatedAtAsc(UUID sessionId);

    List<Message> findBySessionIdOrderByCreatedAtDesc(UUID sessionId, Pageable pageable);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("DELETE FROM Message m WHERE m.session.id = :sessionId")
    void deleteBySessionId(@org.springframework.data.repository.query.Param("sessionId") UUID sessionId);
}
