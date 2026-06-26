package com.agent.mvp.settings.service;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.OrganizeMode;
import com.agent.mvp.settings.PrivacyMode;
import com.agent.mvp.settings.dto.ExportTaskResponse;
import com.agent.mvp.settings.dto.SettingsProfileResponse;
import com.agent.mvp.settings.dto.SettingsStorageResponse;
import com.agent.mvp.settings.dto.UpdateSettingsProfileRequest;
import com.agent.mvp.settings.entity.UserProfile;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SettingsService {

    private final UserProfileService userProfileService;
    private final ModelSourceRepository modelSourceRepository;
    private final KnowledgeItemRepository knowledgeItemRepository;
    private final KnowledgeTagRepository knowledgeTagRepository;

    public SettingsService(
            UserProfileService userProfileService,
            ModelSourceRepository modelSourceRepository,
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeTagRepository knowledgeTagRepository) {
        this.userProfileService = userProfileService;
        this.modelSourceRepository = modelSourceRepository;
        this.knowledgeItemRepository = knowledgeItemRepository;
        this.knowledgeTagRepository = knowledgeTagRepository;
    }

    public SettingsProfileResponse getProfile(UUID userId) {
        User user = userProfileService.requireUser(userId);
        UserProfile profile = userProfileService.getOrCreate(userId);
        return toResponse(user, profile);
    }

    @Transactional
    public SettingsProfileResponse updateProfile(UUID userId, UpdateSettingsProfileRequest request) {
        User user = userProfileService.requireUser(userId);
        UserProfile profile = userProfileService.getOrCreate(userId);

        if (request.displayName() != null) {
            profile.setDisplayName(request.displayName().trim());
        }
        if (request.avatarUrl() != null) {
            profile.setAvatarUrl(request.avatarUrl().trim());
        }
        if (request.organizeMode() != null) {
            profile.setOrganizeMode(OrganizeMode.from(request.organizeMode()).value());
        }
        if (request.privacyMode() != null) {
            profile.setPrivacyMode(PrivacyMode.from(request.privacyMode()).value());
        }

        validateModelSourceOwnership(userId, request.defaultModelSourceId());
        validateModelSourceOwnership(userId, request.summaryModelSourceId());
        validateModelSourceOwnership(userId, request.taggingModelSourceId());

        validateClearFlag("defaultModelSourceId", request.defaultModelSourceId(), request.clearDefaultModelSource());
        validateClearFlag("summaryModelSourceId", request.summaryModelSourceId(), request.clearSummaryModelSource());
        validateClearFlag("taggingModelSourceId", request.taggingModelSourceId(), request.clearTaggingModelSource());

        if (request.defaultModelSourceId() != null) {
            syncDefaultModelSource(userId, request.defaultModelSourceId());
            profile.setDefaultModelSourceId(request.defaultModelSourceId());
        } else if (Boolean.TRUE.equals(request.clearDefaultModelSource())) {
            clearDefaultModelSource(userId);
            profile.setDefaultModelSourceId(null);
        }
        if (request.summaryModelSourceId() != null) {
            profile.setSummaryModelSourceId(request.summaryModelSourceId());
        } else if (Boolean.TRUE.equals(request.clearSummaryModelSource())) {
            profile.setSummaryModelSourceId(null);
        }
        if (request.taggingModelSourceId() != null) {
            profile.setTaggingModelSourceId(request.taggingModelSourceId());
        } else if (Boolean.TRUE.equals(request.clearTaggingModelSource())) {
            profile.setTaggingModelSourceId(null);
        }

        userProfileService.save(profile);
        return toResponse(user, profile);
    }

    public SettingsStorageResponse getStorage(UUID userId) {
        long totalItems = countItems(userId, null);
        return new SettingsStorageResponse(
                totalItems,
                countItems(userId, "inbox"),
                countItems(userId, "ready"),
                countItems(userId, "failed"),
                countItems(userId, "archived"),
                knowledgeTagRepository.selectCount(
                        new LambdaQueryWrapper<com.agent.mvp.knowledge.entity.KnowledgeTag>()
                                .eq(com.agent.mvp.knowledge.entity.KnowledgeTag::getUserId, userId)),
                modelSourceRepository.selectCount(
                        new LambdaQueryWrapper<ModelSource>().eq(ModelSource::getUserId, userId)),
                Instant.now());
    }

    public ExportTaskResponse createExportTask(UUID userId) {
        userProfileService.requireUser(userId);
        return new ExportTaskResponse(UUID.randomUUID(), "pending");
    }

    private void validateModelSourceOwnership(UUID userId, UUID modelSourceId) {
        if (modelSourceId == null) {
            return;
        }
        ModelSource source = modelSourceRepository.selectById(modelSourceId);
        if (source == null || !userId.equals(source.getUserId())) {
            throw new BadRequestException("Model source does not belong to current user");
        }
    }

    private void validateClearFlag(String fieldName, UUID modelSourceId, Boolean clearFlag) {
        if (modelSourceId != null && Boolean.TRUE.equals(clearFlag)) {
            throw new BadRequestException("Cannot set and clear " + fieldName + " at the same time");
        }
    }

    private void syncDefaultModelSource(UUID userId, UUID defaultModelSourceId) {
        List<ModelSource> sources =
                modelSourceRepository.selectList(
                        new LambdaQueryWrapper<ModelSource>().eq(ModelSource::getUserId, userId));
        for (ModelSource source : sources) {
            boolean shouldBeDefault = defaultModelSourceId.equals(source.getId());
            if (Boolean.TRUE.equals(source.getIsDefault()) != shouldBeDefault) {
                source.setIsDefault(shouldBeDefault);
                source.touch();
                modelSourceRepository.updateById(source);
            }
        }
    }

    private void clearDefaultModelSource(UUID userId) {
        List<ModelSource> sources =
                modelSourceRepository.selectList(
                        new LambdaQueryWrapper<ModelSource>().eq(ModelSource::getUserId, userId));
        for (ModelSource source : sources) {
            if (Boolean.TRUE.equals(source.getIsDefault())) {
                source.setIsDefault(false);
                source.touch();
                modelSourceRepository.updateById(source);
            }
        }
    }

    private long countItems(UUID userId, String status) {
        LambdaQueryWrapper<com.agent.mvp.knowledge.entity.KnowledgeItem> wrapper =
                new LambdaQueryWrapper<com.agent.mvp.knowledge.entity.KnowledgeItem>()
                        .eq(com.agent.mvp.knowledge.entity.KnowledgeItem::getUserId, userId);
        if (status != null) {
            wrapper.eq(com.agent.mvp.knowledge.entity.KnowledgeItem::getStatus, status);
        }
        return knowledgeItemRepository.selectCount(wrapper);
    }

    private SettingsProfileResponse toResponse(User user, UserProfile profile) {
        return new SettingsProfileResponse(
                profile.getUserId(),
                user.getEmail(),
                profile.getDisplayName(),
                profile.getAvatarUrl(),
                profile.getOrganizeMode(),
                profile.getPrivacyMode(),
                profile.getDefaultModelSourceId(),
                profile.getSummaryModelSourceId(),
                profile.getTaggingModelSourceId(),
                profile.getCreatedAt(),
                profile.getUpdatedAt());
    }
}
