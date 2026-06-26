package com.agent.mvp.knowledge.entity;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeItemTag {

    private UUID knowledgeItemId;
    private UUID tagId;
}
