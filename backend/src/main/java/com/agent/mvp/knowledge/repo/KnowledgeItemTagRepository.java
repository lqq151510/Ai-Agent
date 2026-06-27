package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeItemTag;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface KnowledgeItemTagRepository {

    @Insert(
            "INSERT INTO knowledge_item_tags(knowledge_item_id, tag_id) "
                    + "VALUES(#{knowledgeItemId,typeHandler=com.agent.mvp.config.UuidTypeHandler}, "
                    + "#{tagId,typeHandler=com.agent.mvp.config.UuidTypeHandler})")
    int insert(KnowledgeItemTag relation);

    @Delete(
            "DELETE FROM knowledge_item_tags WHERE knowledge_item_id = "
                    + "#{knowledgeItemId,typeHandler=com.agent.mvp.config.UuidTypeHandler}")
    int deleteByKnowledgeItemId(@Param("knowledgeItemId") UUID knowledgeItemId);

    @Select(
            "SELECT tag_id FROM knowledge_item_tags WHERE knowledge_item_id = "
                    + "#{knowledgeItemId,typeHandler=com.agent.mvp.config.UuidTypeHandler}")
    List<UUID> findTagIdsByKnowledgeItemId(@Param("knowledgeItemId") UUID knowledgeItemId);

    @Select(
            "SELECT knowledge_item_id FROM knowledge_item_tags WHERE tag_id = "
                    + "#{tagId,typeHandler=com.agent.mvp.config.UuidTypeHandler}")
    List<UUID> findKnowledgeItemIdsByTagId(@Param("tagId") UUID tagId);
}
