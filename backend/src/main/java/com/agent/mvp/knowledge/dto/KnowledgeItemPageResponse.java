package com.agent.mvp.knowledge.dto;

import java.util.List;

public record KnowledgeItemPageResponse(
        List<KnowledgeItemResponse> items, long total, long page, long pageSize) {}
