package com.agent.mvp.settings.service;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.UserService;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.repo.UserProfileRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserProfileService {

    private final UserService userService;
    private final UserProfileRepository userProfileRepository;

    public UserProfileService(
            UserService userService, UserProfileRepository userProfileRepository) {
        this.userService = userService;
        this.userProfileRepository = userProfileRepository;
    }

    public User requireUser(UUID userId) {
        User user = userService.getUserById(userId);
        if (user == null) {
            throw new NotFoundException("User not found");
        }
        return user;
    }

    @Transactional
    public UserProfile getOrCreate(UUID userId) {
        User user = requireUser(userId);
        UserProfile existing = userProfileRepository.selectById(userId);
        if (existing != null) {
            return existing;
        }

        String email = user.getEmail() == null ? "User" : user.getEmail();
        String defaultDisplayName =
                email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        UserProfile created =
                UserProfile.builder()
                        .userId(userId)
                        .displayName(defaultDisplayName)
                        .organizeMode("manual")
                        .privacyMode("local_first")
                        .build();
        created.onCreate();
        userProfileRepository.insert(created);
        return created;
    }

    @Transactional
    public UserProfile save(UserProfile profile) {
        profile.touch();
        if (userProfileRepository.selectById(profile.getUserId()) == null) {
            profile.onCreate();
            userProfileRepository.insert(profile);
        } else {
            userProfileRepository.updateById(profile);
        }
        return profile;
    }
}
