package com.agent.mvp.knowledge.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("knowledge_tags")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeTag {

    @TableId private UUID id;

    private UUID userId;

    private String name;

    private String color;

    private Instant createdAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
