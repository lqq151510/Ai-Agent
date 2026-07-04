package com.agent.mvp.knowledge.repo;

import java.util.UUID;
import lombok.Data;

@Data
public class KnowledgeTagUsageSummaryView {

    private UUID tagId;

    private String name;

    private String color;

    private Long usageCount;
}
