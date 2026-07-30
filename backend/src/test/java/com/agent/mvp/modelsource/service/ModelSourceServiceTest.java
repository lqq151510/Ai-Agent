package com.agent.mvp.modelsource.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ModelSourceServiceTest {

    @Test
    void setDefaultShouldClearExistingDefaultAndUpdateProfile() {
        ModelSourceRepository repository = mock(ModelSourceRepository.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ModelSourceService service =
                new ModelSourceService(repository, probeService, userProfileService);

        UUID userId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        ModelSource existingDefault =
                ModelSource.builder()
                        .id(UUID.randomUUID())
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
        ModelSource target =
                ModelSource.builder()
                        .id(targetId)
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
        UserProfile profile = UserProfile.builder().userId(userId).build();

        when(repository.selectById(targetId)).thenReturn(target);
        when(repository.selectList(any())).thenReturn(List.of(existingDefault));
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);

        var response = service.setDefault(userId, targetId);

        assertTrue(response.isDefault());
        assertEquals(targetId, profile.getDefaultModelSourceId());
        verify(repository).clearDefaultByUserId(eq(userId), any(Instant.class));
        verify(repository).updateById(eq(target));
        verify(userProfileService).save(eq(profile));
    }
}
