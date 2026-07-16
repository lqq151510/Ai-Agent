package com.agent.mvp.ingestion.service;

import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.ingestion.IngestionJobStatus;
import com.agent.mvp.ingestion.IngestionJobType;
import com.agent.mvp.ingestion.dto.IngestionJobResponse;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.ingestion.repo.IngestionJobRepository;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class IngestionJobService {

    private final IngestionJobRepository ingestionJobRepository;

    public IngestionJobService(IngestionJobRepository ingestionJobRepository) {
        this.ingestionJobRepository = ingestionJobRepository;
    }

    public IngestionJob createImportSucceeded(
            UUID userId, UUID knowledgeItemId, String inputSnapshot) {
        IngestionJob job =
                IngestionJob.builder()
                        .userId(userId)
                        .knowledgeItemId(knowledgeItemId)
                        .jobType(IngestionJobType.IMPORT.value())
                        .status(IngestionJobStatus.SUCCEEDED.value())
                        .inputSnapshot(inputSnapshot)
                        .startedAt(Instant.now())
                        .finishedAt(Instant.now())
                        .build();
        job.onCreate();
        ingestionJobRepository.insert(job);
        return job;
    }

    public IngestionJob createRunningOrganize(
            UUID userId, UUID knowledgeItemId, String inputSnapshot) {
        return createRunning(
                userId, knowledgeItemId, IngestionJobType.ORGANIZE.value(), inputSnapshot);
    }

    public IngestionJob createRunning(
            UUID userId, UUID knowledgeItemId, String jobType, String inputSnapshot) {
        String normalizedJobType = IngestionJobType.from(jobType).value();
        IngestionJob job =
                IngestionJob.builder()
                        .userId(userId)
                        .knowledgeItemId(knowledgeItemId)
                        .jobType(normalizedJobType)
                        .status(IngestionJobStatus.RUNNING.value())
                        .inputSnapshot(inputSnapshot)
                        .startedAt(Instant.now())
                        .build();
        job.onCreate();
        ingestionJobRepository.insert(job);
        return job;
    }

    public void markSucceeded(IngestionJob job, String resultSnapshot) {
        job.setStatus(IngestionJobStatus.SUCCEEDED.value());
        job.setResultSnapshot(resultSnapshot);
        job.setFinishedAt(Instant.now());
        ingestionJobRepository.updateById(job);
    }

    public void markFailed(IngestionJob job, String errorMessage) {
        job.setStatus(IngestionJobStatus.FAILED.value());
        job.setErrorMessage(errorMessage);
        job.setFinishedAt(Instant.now());
        ingestionJobRepository.updateById(job);
    }

    public List<IngestionJobResponse> list(
            UUID userId, int limit, UUID knowledgeItemId, String jobType, String status) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        LambdaQueryWrapper<IngestionJob> wrapper =
                new LambdaQueryWrapper<IngestionJob>().eq(IngestionJob::getUserId, userId);
        if (knowledgeItemId != null) {
            wrapper.eq(IngestionJob::getKnowledgeItemId, knowledgeItemId);
        }
        if (jobType != null && !jobType.isBlank()) {
            wrapper.eq(IngestionJob::getJobType, IngestionJobType.from(jobType).value());
        }
        if (status != null && !status.isBlank()) {
            wrapper.eq(IngestionJob::getStatus, IngestionJobStatus.from(status).value());
        }
        return ingestionJobRepository
                .selectList(
                        wrapper.orderByDesc(IngestionJob::getCreatedAt).last("LIMIT " + safeLimit))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public IngestionJobResponse get(UUID userId, UUID jobId) {
        IngestionJob job = ingestionJobRepository.selectById(jobId);
        if (job == null) {
            throw new NotFoundException("Ingestion job not found");
        }
        if (!userId.equals(job.getUserId())) {
            throw new ForbiddenException("Cannot access another user's ingestion job");
        }
        return toResponse(job);
    }

    private IngestionJobResponse toResponse(IngestionJob job) {
        return new IngestionJobResponse(
                job.getId(),
                job.getKnowledgeItemId(),
                job.getJobType(),
                job.getStatus(),
                job.getInputSnapshot(),
                job.getResultSnapshot(),
                job.getErrorMessage(),
                job.getStartedAt(),
                job.getFinishedAt(),
                job.getCreatedAt());
    }
}
