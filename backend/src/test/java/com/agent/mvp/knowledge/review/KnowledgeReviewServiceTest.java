package com.agent.mvp.knowledge.review;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.review.dto.CompleteKnowledgeReviewRequest;
import com.agent.mvp.settings.service.UserProfileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class KnowledgeReviewServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-06T12:00:00Z");

    private final UUID userId = UUID.randomUUID();
    private final UUID otherUserId = UUID.randomUUID();
    private KnowledgeItemRepository itemRepository;
    private KnowledgeItemTagRepository itemTagRepository;
    private KnowledgeReviewStateRepository reviewStateRepository;
    private KnowledgeReviewService service;

    @BeforeEach
    void setUp() {
        itemRepository = mock(KnowledgeItemRepository.class);
        itemTagRepository = mock(KnowledgeItemTagRepository.class);
        reviewStateRepository = mock(KnowledgeReviewStateRepository.class);
        service =
                new KnowledgeReviewService(
                        itemRepository,
                        itemTagRepository,
                        reviewStateRepository,
                        mock(UserProfileService.class),
                        Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void queueContainsOnlyOwnedReadyItemsAndPutsDueStatesBeforeUnseenItems() throws Exception {
        KnowledgeItem dueItem = item(userId, "Due first", "ready");
        KnowledgeItem unseenItem = item(userId, "Unseen second", "ready");
        KnowledgeReviewState dueState =
                KnowledgeReviewState.builder()
                        .knowledgeItemId(dueItem.getId())
                        .dueAt(NOW.minusSeconds(1))
                        .intervalDays(3)
                        .easeFactor(2.5)
                        .repetitions(2)
                        .build();
        KnowledgeItemTagView tag = new KnowledgeItemTagView();
        tag.setKnowledgeItemId(dueItem.getId());
        tag.setTagId(UUID.randomUUID());
        tag.setName("RAG");
        tag.setColor("#1d4ed8");

        when(itemRepository.findDueReviewItems(userId, NOW, 10)).thenReturn(List.of(dueItem));
        when(itemRepository.findUnreviewedReadyItems(userId, 9)).thenReturn(List.of(unseenItem));
        when(itemRepository.countDueReviewItems(userId, NOW)).thenReturn(1L);
        when(itemRepository.countUnreviewedReadyItems(userId)).thenReturn(1L);
        when(reviewStateRepository.selectList(any())).thenReturn(List.of(dueState));
        when(itemTagRepository.findTagsByKnowledgeItemIds(any())).thenReturn(List.of(tag));

        var queue = service.getQueue(userId, 10);

        assertEquals(2, queue.dueCount());
        assertEquals(
                List.of(dueItem.getId(), unseenItem.getId()),
                queue.items().stream().map(item -> item.id()).toList());
        assertEquals("RAG", queue.items().getFirst().tags().getFirst().name());
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(queue);
        assertFalse(json.contains("rawContent"));
        assertFalse(json.contains("contentHash"));
        assertFalse(json.contains("/Users/ze/private"));
        verify(itemRepository).findDueReviewItems(userId, NOW, 10);
        verify(itemRepository).findUnreviewedReadyItems(userId, 9);
    }

    @Test
    void completingAnotherUsersOrArchivedItemIsRejected() {
        KnowledgeItem ownedItem = item(userId, "Owned", "ready");
        KnowledgeItem archivedItem = item(userId, "Archived", "archived");
        when(itemRepository.findForReviewCompletion(ownedItem.getId())).thenReturn(ownedItem);
        when(itemRepository.findForReviewCompletion(archivedItem.getId())).thenReturn(archivedItem);

        assertThrows(
                ForbiddenException.class,
                () -> service.complete(otherUserId, ownedItem.getId(), request("good")));
        assertThrows(
                BadRequestException.class,
                () -> service.complete(userId, archivedItem.getId(), request("good")));
    }

    @Test
    void completeCreatesOneStateWithFixedClockAndClosedRatingVocabulary() {
        KnowledgeItem readyItem = item(userId, "Ready", "ready");
        when(itemRepository.findForReviewCompletion(readyItem.getId())).thenReturn(readyItem);
        when(reviewStateRepository.selectOne(any())).thenReturn(null);

        var response = service.complete(userId, readyItem.getId(), request("good"));

        assertEquals(readyItem.getId(), response.knowledgeItemId());
        assertEquals("good", response.rating());
        assertEquals(NOW.plusSeconds(86_400), response.dueAt());
        assertEquals(1, response.intervalDays());
        ArgumentCaptor<KnowledgeReviewState> stateCaptor =
                ArgumentCaptor.forClass(KnowledgeReviewState.class);
        verify(reviewStateRepository).insert(stateCaptor.capture());
        assertEquals(userId, stateCaptor.getValue().getUserId());
        assertEquals(readyItem.getId(), stateCaptor.getValue().getKnowledgeItemId());
        assertEquals("good", stateCaptor.getValue().getLastRating());
        assertEquals(NOW, stateCaptor.getValue().getLastReviewedAt());
        assertThrows(
                BadRequestException.class,
                () -> service.complete(userId, readyItem.getId(), request("unknown")));
    }

    @Test
    void summaryTreatsUnreviewedReadyItemsAsDueNow() {
        when(itemRepository.countDueReviewItems(userId, NOW)).thenReturn(2L);
        when(itemRepository.countUnreviewedReadyItems(userId)).thenReturn(3L);

        var summary = service.getSummary(userId);

        assertEquals(5, summary.dueCount());
        assertEquals(NOW, summary.nextDueAt());
    }

    private CompleteKnowledgeReviewRequest request(String rating) {
        return new CompleteKnowledgeReviewRequest(rating);
    }

    private KnowledgeItem item(UUID ownerId, String title, String status) {
        return KnowledgeItem.builder()
                .id(UUID.randomUUID())
                .userId(ownerId)
                .title(title)
                .sourceType("markdown")
                .sourceUri("file:///Users/ze/private/notes.md")
                .rawContent("private content")
                .contentHash("secret-hash")
                .summary("summary")
                .status(status)
                .updatedAt(NOW)
                .build();
    }
}
