package com.agent.mvp.settings.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.dto.UpdateSettingsProfileRequest;
import com.agent.mvp.settings.entity.UserProfile;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SettingsServiceTest {

    @Test
    void updateProfileShouldRejectForeignModelSource() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository);

        UUID userId = UUID.randomUUID();
        UUID foreignUserId = UUID.randomUUID();
        UUID modelSourceId = UUID.randomUUID();
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileService.getOrCreate(userId))
                .thenReturn(UserProfile.builder().userId(userId).build());
        when(modelSourceRepository.selectById(modelSourceId))
                .thenReturn(ModelSource.builder().id(modelSourceId).userId(foreignUserId).build());

        assertThrows(
                BadRequestException.class,
                () ->
                        service.updateProfile(
                                userId,
                                new UpdateSettingsProfileRequest(
                                        "name",
                                        null,
                                        "manual",
                                        "local_first",
                                        modelSourceId,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)));
    }

    @Test
    void updateProfileShouldSyncDefaultModelSourceState() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository);

        UUID userId = UUID.randomUUID();
        UUID oldDefaultId = UUID.randomUUID();
        UUID newDefaultId = UUID.randomUUID();
        UserProfile profile =
                UserProfile.builder().userId(userId).defaultModelSourceId(oldDefaultId).build();
        ModelSource oldDefault =
                ModelSource.builder()
                        .id(oldDefaultId)
                        .userId(userId)
                        .name("old")
                        .providerType("openai")
                        .baseUrl("http://old")
                        .apiKey("sk-old")
                        .defaultModel("old-model")
                        .enabled(true)
                        .isDefault(true)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        ModelSource newDefault =
                ModelSource.builder()
                        .id(newDefaultId)
                        .userId(userId)
                        .name("new")
                        .providerType("openai")
                        .baseUrl("http://new")
                        .apiKey("sk-new")
                        .defaultModel("new-model")
                        .enabled(true)
                        .isDefault(false)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);
        when(modelSourceRepository.selectById(newDefaultId)).thenReturn(newDefault);
        when(modelSourceRepository.selectList(org.mockito.ArgumentMatchers.any()))
                .thenReturn(List.of(oldDefault, newDefault));

        var response =
                service.updateProfile(
                        userId,
                        new UpdateSettingsProfileRequest(
                                null,
                                null,
                                null,
                                null,
                                newDefaultId,
                                null,
                                null,
                                null,
                                null,
                                null));

        assertEquals(newDefaultId, profile.getDefaultModelSourceId());
        assertEquals(newDefaultId, response.defaultModelSourceId());
        verify(modelSourceRepository).updateById(oldDefault);
        verify(modelSourceRepository).updateById(newDefault);
        verify(userProfileService).save(profile);
    }

    @Test
    void updateProfileShouldClearModelSourceBindings() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository);

        UUID userId = UUID.randomUUID();
        UUID defaultId = UUID.randomUUID();
        UUID summaryId = UUID.randomUUID();
        UUID taggingId = UUID.randomUUID();
        UserProfile profile =
                UserProfile.builder()
                        .userId(userId)
                        .defaultModelSourceId(defaultId)
                        .summaryModelSourceId(summaryId)
                        .taggingModelSourceId(taggingId)
                        .build();
        ModelSource currentDefault =
                ModelSource.builder()
                        .id(defaultId)
                        .userId(userId)
                        .name("default")
                        .providerType("openai")
                        .baseUrl("http://default")
                        .apiKey("sk-default")
                        .defaultModel("default-model")
                        .enabled(true)
                        .isDefault(true)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);
        when(modelSourceRepository.selectList(org.mockito.ArgumentMatchers.any()))
                .thenReturn(List.of(currentDefault));

        var response =
                service.updateProfile(
                        userId,
                        new UpdateSettingsProfileRequest(
                                null, null, null, null, null, null, null, true, true, true));

        assertNull(profile.getDefaultModelSourceId());
        assertNull(profile.getSummaryModelSourceId());
        assertNull(profile.getTaggingModelSourceId());
        assertNull(response.defaultModelSourceId());
        verify(modelSourceRepository).updateById(currentDefault);
        verify(userProfileService).save(profile);
    }
}
