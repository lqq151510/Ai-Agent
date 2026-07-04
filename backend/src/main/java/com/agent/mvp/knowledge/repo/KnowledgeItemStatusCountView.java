package com.agent.mvp.knowledge.repo;

import lombok.Data;

@Data
public class KnowledgeItemStatusCountView {

    private String status;

    private Long itemCount;
}
