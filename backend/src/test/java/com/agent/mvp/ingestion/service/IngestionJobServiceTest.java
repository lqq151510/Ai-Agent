package com.agent.mvp.ingestion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.ingestion.IngestionJobStatus;
import com.agent.mvp.ingestion.IngestionJobType;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.ingestion.repo.IngestionJobRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class IngestionJobServiceTest {

    private final IngestionJobRepository repository = mock(IngestionJobRepository.class);
    private final IngestionJobService service = new IngestionJobService(repository);

    @Test
    void createMethodsShouldPersistNormalizedJobs() {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();

        IngestionJob imported = service.createImportSucceeded(userId, itemId, "input");
        IngestionJob organizing = service.createRunningOrganize(userId, itemId, "organize");
        IngestionJob reprocessing = service.createRunning(userId, itemId, "REPROCESS", "reprocess");

        assertEquals(IngestionJobType.IMPORT.value(), imported.getJobType());
        assertEquals(IngestionJobStatus.SUCCEEDED.value(), imported.getStatus());
        assertNotNull(imported.getId());
        assertNotNull(imported.getStartedAt());
        assertNotNull(imported.getFinishedAt());
        assertEquals(IngestionJobType.ORGANIZE.value(), organizing.getJobType());
        assertEquals(IngestionJobStatus.RUNNING.value(), organizing.getStatus());
        assertEquals(IngestionJobType.REPROCESS.value(), reprocessing.getJobType());
        verify(repository).insert(imported);
        verify(repository).insert(organizing);
        verify(repository).insert(reprocessing);
    }

    @Test
    void markMethodsShouldPersistTerminalState() {
        IngestionJob succeeded = IngestionJob.builder().status("running").build();
        IngestionJob failed = IngestionJob.builder().status("running").build();

        service.markSucceeded(succeeded, "result");
        service.markFailed(failed, "boom");

        assertEquals(IngestionJobStatus.SUCCEEDED.value(), succeeded.getStatus());
        assertEquals("result", succeeded.getResultSnapshot());
        assertNotNull(succeeded.getFinishedAt());
        assertEquals(IngestionJobStatus.FAILED.value(), failed.getStatus());
        assertEquals("boom", failed.getErrorMessage());
        assertNotNull(failed.getFinishedAt());
        verify(repository).updateById(succeeded);
        verify(repository).updateById(failed);
    }

    @Test
    void listShouldClampLimitAndSupportOptionalFilters() {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        IngestionJob job = ownedJob(userId, UUID.randomUUID());
        when(repository.selectList(any())).thenReturn(List.of(job));

        var unfiltered = service.list(userId, 0, null, null, " ");
        var filtered = service.list(userId, 1_000, itemId, "ORGANIZE", "SUCCEEDED");

        assertEquals(1, unfiltered.size());
        assertEquals(job.getId(), unfiltered.getFirst().id());
        assertEquals(1, filtered.size());
        assertEquals(IngestionJobType.IMPORT.value(), filtered.getFirst().jobType());
    }

    @Test
    void getShouldEnforceExistenceAndOwnership() {
        UUID userId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID foreignJobId = UUID.randomUUID();
        when(repository.selectById(jobId)).thenReturn(ownedJob(userId, jobId));
        when(repository.selectById(foreignJobId))
                .thenReturn(ownedJob(UUID.randomUUID(), foreignJobId));

        assertEquals(jobId, service.get(userId, jobId).id());
        assertThrows(ForbiddenException.class, () -> service.get(userId, foreignJobId));
        assertThrows(NotFoundException.class, () -> service.get(userId, UUID.randomUUID()));
    }

    private static IngestionJob ownedJob(UUID userId, UUID jobId) {
        Instant now = Instant.now();
        return IngestionJob.builder()
                .id(jobId)
                .userId(userId)
                .knowledgeItemId(UUID.randomUUID())
                .jobType(IngestionJobType.IMPORT.value())
                .status(IngestionJobStatus.SUCCEEDED.value())
                .inputSnapshot("input")
                .resultSnapshot("result")
                .startedAt(now)
                .finishedAt(now)
                .createdAt(now)
                .build();
    }
}
