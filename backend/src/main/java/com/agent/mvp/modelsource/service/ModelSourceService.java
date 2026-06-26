package com.agent.mvp.modelsource.service;

import com.agent.mvp.common.exception.BadGatewayException;
import com.agent.mvp.common.exception.ConflictException;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.modelsource.ModelSourceCheckStatus;
import com.agent.mvp.modelsource.ModelSourceProviderType;
import com.agent.mvp.modelsource.dto.CreateModelSourceRequest;
import com.agent.mvp.modelsource.dto.ModelSourceResponse;
import com.agent.mvp.modelsource.dto.ModelSourceTestResponse;
import com.agent.mvp.modelsource.dto.UpdateModelSourceRequest;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ModelSourceService {

    private final ModelSourceRepository modelSourceRepository;
    private final ModelSourceProbeService probeService;
    private final UserProfileService userProfileService;

    public ModelSourceService(
            ModelSourceRepository modelSourceRepository,
            ModelSourceProbeService probeService,
            UserProfileService userProfileService) {
        this.modelSourceRepository = modelSourceRepository;
        this.probeService = probeService;
        this.userProfileService = userProfileService;
    }

    public List<ModelSourceResponse> list(UUID userId) {
        userProfileService.requireUser(userId);
        return modelSourceRepository
                .selectList(
                        new LambdaQueryWrapper<ModelSource>()
                                .eq(ModelSource::getUserId, userId)
                                .orderByDesc(ModelSource::getCreatedAt))
                .stream()
                .sorted(Comparator.comparing(ModelSource::getIsDefault).reversed())
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ModelSourceResponse create(UUID userId, CreateModelSourceRequest request) {
        userProfileService.requireUser(userId);
        ensureNameAvailable(userId, request.name(), null);
        ModelSourceProviderType.from(request.providerType());

        ModelSource source =
                ModelSource.builder()
                        .userId(userId)
                        .providerType(request.providerType().trim())
                        .name(request.name().trim())
                        .baseUrl(request.baseUrl().trim())
                        .apiKey(request.apiKey().trim())
                        .defaultModel(request.defaultModel().trim())
                        .enabled(request.enabled() == null ? true : request.enabled())
                        .isDefault(request.isDefault() == null ? false : request.isDefault())
                        .build();
        source.onCreate();

        if (Boolean.TRUE.equals(source.getIsDefault())) {
            clearDefault(userId);
        }
        modelSourceRepository.insert(source);
        if (Boolean.TRUE.equals(source.getIsDefault())) {
            UserProfile profile = userProfileService.getOrCreate(userId);
            profile.setDefaultModelSourceId(source.getId());
            userProfileService.save(profile);
        }
        return toResponse(source);
    }

    @Transactional
    public ModelSourceResponse update(UUID userId, UUID sourceId, UpdateModelSourceRequest request) {
        ModelSource source = requireOwnedSource(userId, sourceId);
        if (request.name() != null) {
            ensureNameAvailable(userId, request.name(), source.getId());
            source.setName(request.name().trim());
        }
        if (request.providerType() != null) {
            source.setProviderType(ModelSourceProviderType.from(request.providerType()).value());
        }
        if (request.baseUrl() != null) {
            source.setBaseUrl(request.baseUrl().trim());
        }
        if (request.apiKey() != null && !request.apiKey().isBlank()) {
            source.setApiKey(request.apiKey().trim());
        }
        if (request.defaultModel() != null) {
            source.setDefaultModel(request.defaultModel().trim());
        }
        if (request.enabled() != null) {
            source.setEnabled(request.enabled());
        }
        if (Boolean.TRUE.equals(request.isDefault())) {
            clearDefault(userId);
            source.setIsDefault(true);
            UserProfile profile = userProfileService.getOrCreate(userId);
            profile.setDefaultModelSourceId(source.getId());
            userProfileService.save(profile);
        }
        source.touch();
        modelSourceRepository.updateById(source);
        return toResponse(source);
    }

    @Transactional
    public void delete(UUID userId, UUID sourceId) {
        ModelSource source = requireOwnedSource(userId, sourceId);
        UserProfile profile = userProfileService.getOrCreate(userId);
        if (sourceId.equals(profile.getDefaultModelSourceId())
                || sourceId.equals(profile.getSummaryModelSourceId())
                || sourceId.equals(profile.getTaggingModelSourceId())) {
            throw new ConflictException("Model source is still referenced by user profile");
        }
        modelSourceRepository.deleteById(source.getId());
    }

    @Transactional
    public ModelSourceResponse setEnabled(UUID userId, UUID sourceId, boolean enabled) {
        ModelSource source = requireOwnedSource(userId, sourceId);
        source.setEnabled(enabled);
        source.touch();
        modelSourceRepository.updateById(source);
        return toResponse(source);
    }

    @Transactional
    public ModelSourceResponse setDefault(UUID userId, UUID sourceId) {
        ModelSource source = requireOwnedSource(userId, sourceId);
        clearDefault(userId);
        source.setIsDefault(true);
        source.touch();
        modelSourceRepository.updateById(source);
        UserProfile profile = userProfileService.getOrCreate(userId);
        profile.setDefaultModelSourceId(source.getId());
        userProfileService.save(profile);
        return toResponse(source);
    }

    @Transactional
    public ModelSourceTestResponse test(UUID userId, UUID sourceId) {
        ModelSource source = requireOwnedSource(userId, sourceId);
        ModelSourceProbeService.ProbeResult result = probeService.probe(source);
        source.setLastCheckedAt(Instant.now());
        source.setLastCheckStatus(
                result.ok() ? ModelSourceCheckStatus.OK.value() : ModelSourceCheckStatus.ERROR.value());
        source.setLastCheckMessage(result.message());
        source.touch();
        modelSourceRepository.updateById(source);
        if (!result.ok()) {
            throw new BadGatewayException(result.message());
        }
        return new ModelSourceTestResponse(
                source.getId(), source.getLastCheckStatus(), source.getLastCheckMessage(), source.getLastCheckedAt());
    }

    public ModelSource requireOwnedSource(UUID userId, UUID sourceId) {
        ModelSource source = modelSourceRepository.selectById(sourceId);
        if (source == null) {
            throw new NotFoundException("Model source not found");
        }
        if (!userId.equals(source.getUserId())) {
            throw new ForbiddenException("Cannot access another user's model source");
        }
        return source;
    }

    private void clearDefault(UUID userId) {
        List<ModelSource> currentDefaults =
                modelSourceRepository.selectList(
                        new LambdaQueryWrapper<ModelSource>()
                                .eq(ModelSource::getUserId, userId)
                                .eq(ModelSource::getIsDefault, true));
        for (ModelSource current : currentDefaults) {
            current.setIsDefault(false);
            current.touch();
            modelSourceRepository.updateById(current);
        }
    }

    private void ensureNameAvailable(UUID userId, String name, UUID currentId) {
        List<ModelSource> matches =
                modelSourceRepository.selectList(
                        new LambdaQueryWrapper<ModelSource>()
                                .eq(ModelSource::getUserId, userId)
                                .eq(ModelSource::getName, name.trim()));
        boolean taken =
                matches.stream()
                        .anyMatch(source -> currentId == null || !source.getId().equals(currentId));
        if (taken) {
            throw new ConflictException("Model source name already exists");
        }
    }

    private ModelSourceResponse toResponse(ModelSource source) {
        return new ModelSourceResponse(
                source.getId(),
                source.getProviderType(),
                source.getName(),
                source.getBaseUrl(),
                mask(source.getApiKey()),
                source.getDefaultModel(),
                Boolean.TRUE.equals(source.getEnabled()),
                Boolean.TRUE.equals(source.getIsDefault()),
                source.getLastCheckStatus(),
                source.getLastCheckMessage(),
                source.getLastCheckedAt(),
                source.getCreatedAt(),
                source.getUpdatedAt());
    }

    private String mask(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return null;
        }
        if (apiKey.length() <= 6) {
            return "***";
        }
        return apiKey.substring(0, 3) + "***" + apiKey.substring(apiKey.length() - 3);
    }
}
