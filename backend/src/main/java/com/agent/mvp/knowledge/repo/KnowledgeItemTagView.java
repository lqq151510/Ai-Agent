package com.agent.mvp.knowledge.repo;

import java.time.Instant;
import java.util.UUID;
import lombok.Data;

@Data
public class KnowledgeItemTagView {

    private UUID knowledgeItemId;

    private UUID tagId;

    private String name;

    private String color;

    private Instant createdAt;
}
