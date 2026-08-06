package com.agent.mvp.knowledge.review;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("knowledge_review_states")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeReviewState {

    @TableId private UUID id;

    private UUID userId;

    private UUID knowledgeItemId;

    private Instant dueAt;

    private Integer intervalDays;

    private Double easeFactor;

    private Integer repetitions;

    private String lastRating;

    private Instant lastReviewedAt;

    private Instant createdAt;

    private Instant updatedAt;

    public void onCreate(Instant now) {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = createdAt;
        }
    }

    public void touch(Instant now) {
        updatedAt = now;
    }
}
