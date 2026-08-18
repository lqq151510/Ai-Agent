package com.agent.mvp.knowledge.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Metadata for a desktop-managed original. It deliberately contains no path, storage key, or bytes.
 */
@TableName("knowledge_source_assets")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeSourceAsset {

    @TableId private UUID id;

    private UUID userId;

    private UUID knowledgeItemId;

    private String contentHash;

    private String originalFilename;

    private String mediaType;

    private Long byteSize;

    private String origin;

    private String availability;

    private Instant createdAt;

    private Instant updatedAt;

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
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
