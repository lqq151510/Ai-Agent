package com.agent.mvp.knowledge.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("knowledge_items")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeItem {

    @TableId
    private UUID id;

    private UUID userId;

    private String sourceType;

    private String title;

    private String sourceUri;

    private String rawContent;

    private String cleanedContent;

    private String summary;

    private String status;

    private String language;

    private Integer wordCount;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant archivedAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (updatedAt == null) {
            updatedAt = createdAt;
        }
        if (wordCount == null) {
            wordCount = 0;
        }
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
