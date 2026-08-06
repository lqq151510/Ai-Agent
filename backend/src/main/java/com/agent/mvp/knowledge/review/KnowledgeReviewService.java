package com.agent.mvp.knowledge.review;

import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.knowledge.KnowledgeItemStatus;
import com.agent.mvp.knowledge.dto.TagResponse;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.review.dto.CompleteKnowledgeReviewRequest;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewItemResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewQueueResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewStateResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewSummaryResponse;
import com.agent.mvp.settings.service.UserProfileService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KnowledgeReviewService {

    private static final int DEFAULT_QUEUE_LIMIT = 10;
    private static final int MAX_QUEUE_LIMIT = 20;

    private final KnowledgeItemRepository knowledgeItemRepository;
    private final KnowledgeItemTagRepository knowledgeItemTagRepository;
    private final KnowledgeReviewStateRepository knowledgeReviewStateRepository;
    private final UserProfileService userProfileService;
    private final Clock clock;
    private final KnowledgeReviewScheduler scheduler;

    @Autowired
    public KnowledgeReviewService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            KnowledgeReviewStateRepository knowledgeReviewStateRepository,
            UserProfileService userProfileService,
            Clock clock) {
        this(
                knowledgeItemRepository,
                knowledgeItemTagRepository,
                knowledgeReviewStateRepository,
                userProfileService,
                clock,
                new KnowledgeReviewScheduler());
    }

    KnowledgeReviewService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            KnowledgeReviewStateRepository knowledgeReviewStateRepository,
            UserProfileService userProfileService,
            Clock clock,
            KnowledgeReviewScheduler scheduler) {
        this.knowledgeItemRepository = knowledgeItemRepository;
        this.knowledgeItemTagRepository = knowledgeItemTagRepository;
        this.knowledgeReviewStateRepository = knowledgeReviewStateRepository;
        this.userProfileService = userProfileService;
        this.clock = clock;
        this.scheduler = scheduler;
    }

    public KnowledgeReviewQueueResponse getQueue(UUID userId, int requestedLimit) {
        userProfileService.requireUser(userId);
        int limit = normalizeLimit(requestedLimit);
        Instant now = clock.instant();
        List<KnowledgeItem> dueItems = knowledgeItemRepository.findDueReviewItems(userId, now, limit);
        int remaining = Math.max(0, limit - dueItems.size());
        List<KnowledgeItem> unseenItems = remaining == 0
                ? List.of()
                : knowledgeItemRepository.findUnreviewedReadyItems(userId, remaining);

        List<KnowledgeItem> queueItems = new ArrayList<>(dueItems.size() + unseenItems.size());
        queueItems.addAll(dueItems);
        queueItems.addAll(unseenItems);
        Map<UUID, KnowledgeReviewState> statesByItemId = findStatesByItemId(userId, queueItems);
        Map<UUID, List<TagResponse>> tagsByItemId = findTagsByItemId(queueItems);

        return new KnowledgeReviewQueueResponse(
                queueItems.stream()
                        .map(
                                item ->
                                        toQueueItemResponse(
                                                item,
                                                statesByItemId.get(item.getId()),
                                                tagsByItemId.getOrDefault(item.getId(), List.of())))
                        .toList(),
                dueCount(userId, now));
    }

    @Transactional
    public KnowledgeReviewStateResponse complete(
            UUID userId, UUID itemId, CompleteKnowledgeReviewRequest request) {
        userProfileService.requireUser(userId);
        if (request == null) {
            throw new BadRequestException("复习反馈不能为空");
        }
        KnowledgeReviewRating rating = KnowledgeReviewRating.from(request.rating());
        // Lock the parent item before reading or inserting its unique review state. This serializes
        // duplicate submissions even when the first review state has not been created yet.
        KnowledgeItem item = knowledgeItemRepository.findForReviewCompletion(itemId);
        if (item == null) {
            throw new NotFoundException("知识条目不存在");
        }
        if (!userId.equals(item.getUserId())) {
            throw new ForbiddenException("无权复习该知识条目");
        }
        if (!KnowledgeItemStatus.READY.value().equals(item.getStatus())) {
            throw new BadRequestException("只有已整理的知识条目可以回顾");
        }

        Instant now = clock.instant();
        KnowledgeReviewState state = findState(userId, itemId);
        if (state == null) {
            state = createState(userId, itemId, rating, now);
            try {
                knowledgeReviewStateRepository.insert(state);
            } catch (DuplicateKeyException duplicateKeyException) {
                state = findState(userId, itemId);
                if (state == null) {
                    throw duplicateKeyException;
                }
                applySchedule(state, scheduler.next(state, rating, now), rating, now);
                knowledgeReviewStateRepository.updateById(state);
            }
        } else {
            applySchedule(state, scheduler.next(state, rating, now), rating, now);
            knowledgeReviewStateRepository.updateById(state);
        }
        return toStateResponse(state);
    }

    public KnowledgeReviewSummaryResponse getSummary(UUID userId) {
        userProfileService.requireUser(userId);
        Instant now = clock.instant();
        long unreviewedCount = knowledgeItemRepository.countUnreviewedReadyItems(userId);
        long dueCount = knowledgeItemRepository.countDueReviewItems(userId, now) + unreviewedCount;
        Instant nextDueAt = unreviewedCount > 0 ? now : knowledgeItemRepository.findNextReviewDueAt(userId);
        return new KnowledgeReviewSummaryResponse(dueCount, nextDueAt);
    }

    private int normalizeLimit(int requestedLimit) {
        if (requestedLimit <= 0) {
            return DEFAULT_QUEUE_LIMIT;
        }
        return Math.min(MAX_QUEUE_LIMIT, requestedLimit);
    }

    private long dueCount(UUID userId, Instant now) {
        return knowledgeItemRepository.countDueReviewItems(userId, now)
                + knowledgeItemRepository.countUnreviewedReadyItems(userId);
    }

    private KnowledgeReviewState findState(UUID userId, UUID itemId) {
        return knowledgeReviewStateRepository.selectOne(
                new LambdaQueryWrapper<KnowledgeReviewState>()
                        .eq(KnowledgeReviewState::getUserId, userId)
                        .eq(KnowledgeReviewState::getKnowledgeItemId, itemId));
    }

    private KnowledgeReviewState createState(
            UUID userId, UUID itemId, KnowledgeReviewRating rating, Instant now) {
        ReviewSchedule schedule = scheduler.next(null, rating, now);
        KnowledgeReviewState state =
                KnowledgeReviewState.builder().userId(userId).knowledgeItemId(itemId).build();
        applySchedule(state, schedule, rating, now);
        state.onCreate(now);
        return state;
    }

    private void applySchedule(
            KnowledgeReviewState state,
            ReviewSchedule schedule,
            KnowledgeReviewRating rating,
            Instant now) {
        state.setDueAt(schedule.dueAt());
        state.setIntervalDays(schedule.intervalDays());
        state.setEaseFactor(schedule.easeFactor());
        state.setRepetitions(schedule.repetitions());
        state.setLastRating(rating.value());
        state.setLastReviewedAt(now);
        state.touch(now);
    }

    private Map<UUID, KnowledgeReviewState> findStatesByItemId(
            UUID userId, List<KnowledgeItem> items) {
        if (items.isEmpty()) {
            return Map.of();
        }
        List<UUID> itemIds = items.stream().map(KnowledgeItem::getId).toList();
        return knowledgeReviewStateRepository
                .selectList(
                        new LambdaQueryWrapper<KnowledgeReviewState>()
                                .eq(KnowledgeReviewState::getUserId, userId)
                                .in(KnowledgeReviewState::getKnowledgeItemId, itemIds))
                .stream()
                .collect(
                        java.util.stream.Collectors.toMap(
                                KnowledgeReviewState::getKnowledgeItemId,
                                state -> state,
                                (first, ignored) -> first,
                                HashMap::new));
    }

    private Map<UUID, List<TagResponse>> findTagsByItemId(List<KnowledgeItem> items) {
        if (items.isEmpty()) {
            return Map.of();
        }
        return knowledgeItemTagRepository
                .findTagsByKnowledgeItemIds(items.stream().map(KnowledgeItem::getId).toList())
                .stream()
                .collect(
                        java.util.stream.Collectors.groupingBy(
                                KnowledgeItemTagView::getKnowledgeItemId,
                                java.util.stream.Collectors.mapping(
                                        tag ->
                                                new TagResponse(
                                                        tag.getTagId(),
                                                        tag.getName(),
                                                        tag.getColor(),
                                                        tag.getCreatedAt()),
                                        java.util.stream.Collectors.toList())));
    }

    private KnowledgeReviewItemResponse toQueueItemResponse(
            KnowledgeItem item, KnowledgeReviewState state, List<TagResponse> tags) {
        return new KnowledgeReviewItemResponse(
                item.getId(),
                item.getTitle(),
                item.getSourceType(),
                item.getSummary() == null ? "" : item.getSummary(),
                tags.stream().sorted(Comparator.comparing(TagResponse::name)).toList(),
                item.getUpdatedAt(),
                state == null ? null : state.getDueAt(),
                state == null ? null : state.getIntervalDays(),
                state == null ? null : state.getEaseFactor(),
                state == null ? null : state.getRepetitions());
    }

    private KnowledgeReviewStateResponse toStateResponse(KnowledgeReviewState state) {
        return new KnowledgeReviewStateResponse(
                state.getKnowledgeItemId(),
                state.getLastRating(),
                state.getDueAt(),
                state.getIntervalDays(),
                state.getEaseFactor(),
                state.getRepetitions());
    }
}
