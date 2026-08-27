package com.agent.mvp.settings.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.UserService;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.repo.UserProfileRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class UserProfileServiceTest {

    private final UserService userService = mock(UserService.class);
    private final UserProfileRepository repository = mock(UserProfileRepository.class);
    private final UserProfileService service = new UserProfileService(userService, repository);

    @Test
    void requireUserShouldReturnExistingUserAndRejectMissingUser() {
        UUID existingId = UUID.randomUUID();
        UUID missingId = UUID.randomUUID();
        User user = User.builder().id(existingId).email("user@example.com").build();
        when(userService.getUserById(existingId)).thenReturn(user);

        assertSame(user, service.requireUser(existingId));
        assertThrows(NotFoundException.class, () -> service.requireUser(missingId));
    }

    @Test
    void getOrCreateShouldReturnExistingProfileWithoutInsert() {
        UUID userId = UUID.randomUUID();
        UserProfile existing = UserProfile.builder().userId(userId).displayName("existing").build();
        when(userService.getUserById(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(repository.selectById(userId)).thenReturn(existing);

        assertSame(existing, service.getOrCreate(userId));
        verify(repository, never()).insert(existing);
    }

    @Test
    void getOrCreateShouldDeriveDisplayNameFromEmailVariants() {
        UUID emailId = UUID.randomUUID();
        UUID plainId = UUID.randomUUID();
        UUID nullEmailId = UUID.randomUUID();
        when(userService.getUserById(emailId))
                .thenReturn(User.builder().id(emailId).email("zebao@example.com").build());
        when(userService.getUserById(plainId))
                .thenReturn(User.builder().id(plainId).email("Local User").build());
        when(userService.getUserById(nullEmailId))
                .thenReturn(User.builder().id(nullEmailId).email(null).build());

        UserProfile emailProfile = service.getOrCreate(emailId);
        UserProfile plainProfile = service.getOrCreate(plainId);
        UserProfile nullEmailProfile = service.getOrCreate(nullEmailId);

        assertEquals("zebao", emailProfile.getDisplayName());
        assertEquals("Local User", plainProfile.getDisplayName());
        assertEquals("User", nullEmailProfile.getDisplayName());
        assertEquals("manual", emailProfile.getOrganizeMode());
        assertEquals("local_first", emailProfile.getPrivacyMode());
        assertNotNull(emailProfile.getCreatedAt());
        verify(repository).insert(emailProfile);
        verify(repository).insert(plainProfile);
        verify(repository).insert(nullEmailProfile);
    }

    @Test
    void saveShouldInsertNewProfileAndUpdateExistingProfile() {
        UUID newId = UUID.randomUUID();
        UUID existingId = UUID.randomUUID();
        UserProfile created = UserProfile.builder().userId(newId).build();
        UserProfile existing = UserProfile.builder().userId(existingId).build();
        when(repository.selectById(existingId)).thenReturn(existing);

        assertSame(created, service.save(created));
        assertSame(existing, service.save(existing));

        assertNotNull(created.getCreatedAt());
        assertNotNull(created.getUpdatedAt());
        assertNotNull(existing.getUpdatedAt());
        verify(repository).insert(created);
        verify(repository).updateById(existing);
    }
}
