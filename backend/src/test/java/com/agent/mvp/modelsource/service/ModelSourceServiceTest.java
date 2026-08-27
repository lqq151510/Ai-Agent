package com.agent.mvp.modelsource.service;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.common.exception.BadGatewayException;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.ConflictException;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.modelsource.dto.CreateModelSourceRequest;
import com.agent.mvp.modelsource.dto.ModelSourceResponse;
import com.agent.mvp.modelsource.dto.ModelSourceTestResponse;
import com.agent.mvp.modelsource.dto.UpdateModelSourceRequest;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ModelSourceServiceTest {

    private static final Instant CREATED_AT = Instant.parse("2026-08-20T00:00:00Z");

    @Mock private ModelSourceRepository repository;

    @Mock private ModelSourceProbeService probeService;

    @Mock private UserProfileService userProfileService;

    private ModelSourceService service;
    private UUID userId;

    @BeforeEach
    void setUp() {
        service = new ModelSourceService(repository, probeService, userProfileService);
        userId = UUID.randomUUID();
    }

    @Test
    void listShouldRequireUserSortDefaultFirstAndMaskEveryKeyShape() {
        ModelSource shortKey = source(UUID.randomUUID(), userId, "short", "123456", true, false);
        ModelSource blankKey = source(UUID.randomUUID(), userId, "blank", "   ", true, false);
        ModelSource defaultSource =
                source(UUID.randomUUID(), userId, "default", "sk-123456789", true, true);
        ModelSource missingKey = source(UUID.randomUUID(), userId, "missing", null, null, false);
        when(repository.selectList(any()))
                .thenReturn(List.of(shortKey, blankKey, defaultSource, missingKey));

        List<ModelSourceResponse> responses = service.list(userId);

        assertAll(
                () ->
                        assertEquals(
                                List.of("default", "short", "blank", "missing"),
                                responses.stream().map(ModelSourceResponse::name).toList()),
                () -> assertEquals("sk-***789", responses.get(0).apiKeyMasked()),
                () -> assertEquals("***", responses.get(1).apiKeyMasked()),
                () -> assertNull(responses.get(2).apiKeyMasked()),
                () -> assertNull(responses.get(3).apiKeyMasked()),
                () -> assertTrue(responses.get(0).isDefault()),
                () -> assertFalse(responses.get(3).enabled()));
        verify(userProfileService).requireUser(userId);
    }

    @Test
    void createShouldTrimFieldsApplyDefaultsAndMaskApiKey() {
        CreateModelSourceRequest request =
                new CreateModelSourceRequest(
                        "openai",
                        "  Personal OpenAI  ",
                        "  https://api.example.test/v1  ",
                        "  abcdefg  ",
                        "  gpt-test  ",
                        null,
                        null);
        when(repository.selectList(any())).thenReturn(List.of());

        ModelSourceResponse response = service.create(userId, request);

        ArgumentCaptor<ModelSource> sourceCaptor = ArgumentCaptor.forClass(ModelSource.class);
        verify(repository).insert(sourceCaptor.capture());
        ModelSource created = sourceCaptor.getValue();
        assertAll(
                () -> assertNotNull(created.getId()),
                () -> assertEquals(userId, created.getUserId()),
                () -> assertEquals("openai", created.getProviderType()),
                () -> assertEquals("Personal OpenAI", created.getName()),
                () -> assertEquals("https://api.example.test/v1", created.getBaseUrl()),
                () -> assertEquals("abcdefg", created.getApiKey()),
                () -> assertEquals("gpt-test", created.getDefaultModel()),
                () -> assertTrue(created.getEnabled()),
                () -> assertFalse(created.getIsDefault()),
                () -> assertEquals("unknown", created.getLastCheckStatus()),
                () -> assertNotNull(created.getCreatedAt()),
                () -> assertEquals(created.getCreatedAt(), created.getUpdatedAt()),
                () -> assertEquals("abc***efg", response.apiKeyMasked()),
                () -> assertTrue(response.enabled()),
                () -> assertFalse(response.isDefault()));
        verify(userProfileService).requireUser(userId);
        verify(repository, never()).clearDefaultByUserId(any(), any());
        verify(userProfileService, never()).getOrCreate(any());
        verify(userProfileService, never()).save(any());
    }

    @Test
    void createShouldPersistExplicitDisabledDefaultAndUpdateProfile() {
        UserProfile profile = UserProfile.builder().userId(userId).build();
        CreateModelSourceRequest request =
                new CreateModelSourceRequest(
                        "deepseek",
                        "DeepSeek",
                        "https://api.deepseek.test/v1",
                        "secret-key",
                        "deepseek-chat",
                        false,
                        true);
        when(repository.selectList(any())).thenReturn(List.of());
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);

        ModelSourceResponse response = service.create(userId, request);

        ArgumentCaptor<ModelSource> sourceCaptor = ArgumentCaptor.forClass(ModelSource.class);
        verify(repository).insert(sourceCaptor.capture());
        ModelSource created = sourceCaptor.getValue();
        assertAll(
                () -> assertFalse(response.enabled()),
                () -> assertTrue(response.isDefault()),
                () -> assertEquals(created.getId(), profile.getDefaultModelSourceId()));
        verify(repository).clearDefaultByUserId(eq(userId), any(Instant.class));
        verify(userProfileService).save(profile);
    }

    @Test
    void createShouldRejectDuplicateName() {
        ModelSource duplicate =
                source(UUID.randomUUID(), userId, "Duplicate", "secret-key", true, false);
        when(repository.selectList(any())).thenReturn(List.of(duplicate));
        CreateModelSourceRequest request =
                new CreateModelSourceRequest(
                        "openai",
                        " Duplicate ",
                        "https://api.example.test/v1",
                        "secret-key",
                        "gpt-test",
                        true,
                        false);

        ConflictException exception =
                assertThrows(ConflictException.class, () -> service.create(userId, request));

        assertEquals("Model source name already exists", exception.getMessage());
        verify(repository, never()).insert(any(ModelSource.class));
    }

    @Test
    void createShouldRejectUnsupportedProvider() {
        when(repository.selectList(any())).thenReturn(List.of());
        CreateModelSourceRequest request =
                new CreateModelSourceRequest(
                        "unsupported",
                        "Invalid",
                        "https://api.example.test/v1",
                        "secret-key",
                        "model",
                        true,
                        false);

        BadRequestException exception =
                assertThrows(BadRequestException.class, () -> service.create(userId, request));

        assertEquals("Unsupported providerType: unsupported", exception.getMessage());
        verify(repository, never()).insert(any(ModelSource.class));
    }

    @Test
    void updateShouldApplyEveryProvidedFieldAndUpdateDefaultProfile() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Old", "old-secret", true, false);
        UserProfile profile = UserProfile.builder().userId(userId).build();
        when(repository.selectById(sourceId)).thenReturn(existing);
        when(repository.selectList(any())).thenReturn(List.of(existing));
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);
        UpdateModelSourceRequest request =
                new UpdateModelSourceRequest(
                        "anthropic",
                        "  New Name  ",
                        "  https://anthropic.example.test  ",
                        "  new-secret  ",
                        "  claude-test  ",
                        false,
                        true);

        ModelSourceResponse response = service.update(userId, sourceId, request);

        assertAll(
                () -> assertEquals("anthropic", response.providerType()),
                () -> assertEquals("New Name", response.name()),
                () -> assertEquals("https://anthropic.example.test", response.baseUrl()),
                () -> assertEquals("new***ret", response.apiKeyMasked()),
                () -> assertEquals("claude-test", response.defaultModel()),
                () -> assertFalse(response.enabled()),
                () -> assertTrue(response.isDefault()),
                () -> assertEquals(sourceId, profile.getDefaultModelSourceId()),
                () -> assertTrue(existing.getUpdatedAt().isAfter(CREATED_AT)));
        verify(repository).clearDefaultByUserId(eq(userId), any(Instant.class));
        verify(repository).updateById(existing);
        verify(userProfileService).save(profile);
    }

    @Test
    void updateShouldLeaveFieldsUnchangedWhenEveryOptionIsNull() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "old-secret", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);
        UpdateModelSourceRequest request =
                new UpdateModelSourceRequest(null, null, null, null, null, null, null);

        ModelSourceResponse response = service.update(userId, sourceId, request);

        assertAll(
                () -> assertEquals("openai", response.providerType()),
                () -> assertEquals("Existing", response.name()),
                () -> assertEquals("https://example.test/v1", response.baseUrl()),
                () -> assertEquals("old***ret", response.apiKeyMasked()),
                () -> assertEquals("test-model", response.defaultModel()),
                () -> assertTrue(response.enabled()),
                () -> assertFalse(response.isDefault()));
        verify(repository).updateById(existing);
        verify(repository, never()).clearDefaultByUserId(any(), any());
        verify(userProfileService, never()).getOrCreate(any());
    }

    @Test
    void updateShouldIgnoreBlankApiKey() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "old-secret", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);
        UpdateModelSourceRequest request =
                new UpdateModelSourceRequest(null, null, null, "   ", null, null, false);

        ModelSourceResponse response = service.update(userId, sourceId, request);

        assertEquals("old***ret", response.apiKeyMasked());
        assertEquals("old-secret", existing.getApiKey());
        verify(repository).updateById(existing);
    }

    @Test
    void updateShouldRejectNameOwnedByAnotherSource() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "old-secret", true, false);
        ModelSource duplicate =
                source(UUID.randomUUID(), userId, "Taken", "another-secret", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);
        when(repository.selectList(any())).thenReturn(List.of(duplicate));
        UpdateModelSourceRequest request =
                new UpdateModelSourceRequest(null, " Taken ", null, null, null, null, null);

        ConflictException exception =
                assertThrows(
                        ConflictException.class, () -> service.update(userId, sourceId, request));

        assertEquals("Model source name already exists", exception.getMessage());
        verify(repository, never()).updateById(any(ModelSource.class));
    }

    @Test
    void updateShouldRejectUnsupportedProvider() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "old-secret", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);
        UpdateModelSourceRequest request =
                new UpdateModelSourceRequest("unsupported", null, null, null, null, null, null);

        assertThrows(BadRequestException.class, () -> service.update(userId, sourceId, request));

        verify(repository, never()).updateById(any(ModelSource.class));
    }

    @Test
    void deleteShouldRemoveUnreferencedOwnedSource() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "secret-key", true, false);
        UserProfile profile =
                UserProfile.builder()
                        .userId(userId)
                        .defaultModelSourceId(UUID.randomUUID())
                        .summaryModelSourceId(UUID.randomUUID())
                        .taggingModelSourceId(UUID.randomUUID())
                        .build();
        when(repository.selectById(sourceId)).thenReturn(existing);
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);

        service.delete(userId, sourceId);

        verify(repository).deleteById(sourceId);
    }

    @Test
    void deleteShouldRejectSourcesReferencedByAnyProfileSlot() {
        UUID defaultId = UUID.randomUUID();
        UUID summaryId = UUID.randomUUID();
        UUID taggingId = UUID.randomUUID();
        when(repository.selectById(defaultId))
                .thenReturn(source(defaultId, userId, "Default", "secret-key", true, true));
        when(repository.selectById(summaryId))
                .thenReturn(source(summaryId, userId, "Summary", "secret-key", true, false));
        when(repository.selectById(taggingId))
                .thenReturn(source(taggingId, userId, "Tagging", "secret-key", true, false));
        UserProfile defaultProfile =
                UserProfile.builder().userId(userId).defaultModelSourceId(defaultId).build();
        UserProfile summaryProfile =
                UserProfile.builder()
                        .userId(userId)
                        .defaultModelSourceId(UUID.randomUUID())
                        .summaryModelSourceId(summaryId)
                        .build();
        UserProfile taggingProfile =
                UserProfile.builder()
                        .userId(userId)
                        .defaultModelSourceId(UUID.randomUUID())
                        .summaryModelSourceId(UUID.randomUUID())
                        .taggingModelSourceId(taggingId)
                        .build();
        when(userProfileService.getOrCreate(userId))
                .thenReturn(defaultProfile, summaryProfile, taggingProfile);

        ConflictException defaultConflict =
                assertThrows(ConflictException.class, () -> service.delete(userId, defaultId));
        ConflictException summaryConflict =
                assertThrows(ConflictException.class, () -> service.delete(userId, summaryId));
        ConflictException taggingConflict =
                assertThrows(ConflictException.class, () -> service.delete(userId, taggingId));

        assertAll(
                () ->
                        assertEquals(
                                "Model source is still referenced by user profile",
                                defaultConflict.getMessage()),
                () -> assertEquals(defaultConflict.getMessage(), summaryConflict.getMessage()),
                () -> assertEquals(defaultConflict.getMessage(), taggingConflict.getMessage()));
        verify(repository, never()).deleteById(any(UUID.class));
    }

    @Test
    void setEnabledShouldPersistDisabledState() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "secret-key", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);

        ModelSourceResponse response = service.setEnabled(userId, sourceId, false);

        assertFalse(response.enabled());
        assertTrue(existing.getUpdatedAt().isAfter(CREATED_AT));
        verify(repository).updateById(existing);
    }

    @Test
    void setDefaultShouldClearExistingDefaultAndUpdateProfile() {
        UUID targetId = UUID.randomUUID();
        ModelSource target = source(targetId, userId, "New", "secret-key", true, false);
        UserProfile profile = UserProfile.builder().userId(userId).build();
        when(repository.selectById(targetId)).thenReturn(target);
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);

        ModelSourceResponse response = service.setDefault(userId, targetId);

        assertTrue(response.isDefault());
        assertEquals(targetId, profile.getDefaultModelSourceId());
        verify(repository).clearDefaultByUserId(eq(userId), any(Instant.class));
        verify(repository).updateById(target);
        verify(userProfileService).save(profile);
    }

    @Test
    void testShouldPersistSuccessfulProbeResult() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "secret-key", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);
        when(probeService.probe(existing))
                .thenReturn(new ModelSourceProbeService.ProbeResult(true, "Endpoint reachable"));

        ModelSourceTestResponse response = service.test(userId, sourceId);

        assertAll(
                () -> assertEquals(sourceId, response.id()),
                () -> assertEquals("ok", response.status()),
                () -> assertEquals("Endpoint reachable", response.message()),
                () -> assertNotNull(response.checkedAt()),
                () -> assertEquals(response.checkedAt(), existing.getLastCheckedAt()));
        verify(repository).updateById(existing);
    }

    @Test
    void testShouldPersistFailedProbeBeforeThrowingBadGateway() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "secret-key", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);
        when(probeService.probe(existing))
                .thenReturn(new ModelSourceProbeService.ProbeResult(false, "Connection refused"));

        BadGatewayException exception =
                assertThrows(BadGatewayException.class, () -> service.test(userId, sourceId));

        assertAll(
                () -> assertEquals("Connection refused", exception.getMessage()),
                () -> assertEquals("error", existing.getLastCheckStatus()),
                () -> assertEquals("Connection refused", existing.getLastCheckMessage()),
                () -> assertNotNull(existing.getLastCheckedAt()));
        verify(repository).updateById(existing);
    }

    @Test
    void requireOwnedSourceShouldReturnOwnedSource() {
        UUID sourceId = UUID.randomUUID();
        ModelSource existing = source(sourceId, userId, "Existing", "secret-key", true, false);
        when(repository.selectById(sourceId)).thenReturn(existing);

        ModelSource result = service.requireOwnedSource(userId, sourceId);

        assertSame(existing, result);
    }

    @Test
    void requireOwnedSourceShouldRejectMissingSource() {
        UUID sourceId = UUID.randomUUID();
        when(repository.selectById(sourceId)).thenReturn(null);

        NotFoundException exception =
                assertThrows(
                        NotFoundException.class,
                        () -> service.requireOwnedSource(userId, sourceId));

        assertEquals("Model source not found", exception.getMessage());
    }

    @Test
    void requireOwnedSourceShouldRejectForeignSource() {
        UUID sourceId = UUID.randomUUID();
        ModelSource foreign =
                source(sourceId, UUID.randomUUID(), "Foreign", "secret-key", true, false);
        when(repository.selectById(sourceId)).thenReturn(foreign);

        ForbiddenException exception =
                assertThrows(
                        ForbiddenException.class,
                        () -> service.requireOwnedSource(userId, sourceId));

        assertEquals("Cannot access another user's model source", exception.getMessage());
    }

    private ModelSource source(
            UUID sourceId,
            UUID ownerId,
            String name,
            String apiKey,
            Boolean enabled,
            Boolean isDefault) {
        return ModelSource.builder()
                .id(sourceId)
                .userId(ownerId)
                .providerType("openai")
                .name(name)
                .baseUrl("https://example.test/v1")
                .apiKey(apiKey)
                .defaultModel("test-model")
                .enabled(enabled)
                .isDefault(isDefault)
                .lastCheckStatus("unknown")
                .createdAt(CREATED_AT)
                .updatedAt(CREATED_AT)
                .build();
    }
}
