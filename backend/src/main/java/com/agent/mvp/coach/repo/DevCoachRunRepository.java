package com.agent.mvp.coach.repo;

import com.agent.mvp.coach.entity.DevCoachRun;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DevCoachRunRepository extends JpaRepository<DevCoachRun, UUID> {

    List<DevCoachRun> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
}
