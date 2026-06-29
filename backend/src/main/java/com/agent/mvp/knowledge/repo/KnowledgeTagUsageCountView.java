package com.agent.mvp.knowledge.repo;

import java.util.UUID;
import lombok.Data;

@Data
public class KnowledgeTagUsageCountView {

    private UUID tagId;

    private Long usageCount;
}
