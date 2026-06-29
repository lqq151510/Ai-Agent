package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeItemTag;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
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

    @Results(
            id = "knowledgeItemTagViewMap",
            value = {
                @Result(
                        column = "knowledge_item_id",
                        property = "knowledgeItemId",
                        typeHandler = com.agent.mvp.config.UuidTypeHandler.class),
                @Result(
                        column = "tag_id",
                        property = "tagId",
                        typeHandler = com.agent.mvp.config.UuidTypeHandler.class),
                @Result(column = "name", property = "name"),
                @Result(column = "color", property = "color"),
                @Result(column = "created_at", property = "createdAt")
            })
    @Select(
            """
            <script>
            SELECT
                kit.knowledge_item_id,
                kt.id AS tag_id,
                kt.name,
                kt.color,
                kt.created_at
            FROM knowledge_item_tags kit
            JOIN knowledge_tags kt ON kt.id = kit.tag_id
            WHERE kit.knowledge_item_id IN
            <foreach collection="knowledgeItemIds" item="knowledgeItemId" open="(" separator="," close=")">
                #{knowledgeItemId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
            </foreach>
            ORDER BY kt.name ASC
            </script>
            """)
    List<KnowledgeItemTagView> findTagsByKnowledgeItemIds(@Param("knowledgeItemIds") List<UUID> knowledgeItemIds);

    @Results(
            id = "knowledgeTagUsageCountViewMap",
            value = {
                @Result(
                        column = "tag_id",
                        property = "tagId",
                        typeHandler = com.agent.mvp.config.UuidTypeHandler.class),
                @Result(column = "usage_count", property = "usageCount")
            })
    @Select(
            """
            <script>
            SELECT tag_id, COUNT(*) AS usage_count
            FROM knowledge_item_tags
            WHERE tag_id IN
            <foreach collection="tagIds" item="tagId" open="(" separator="," close=")">
                #{tagId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
            </foreach>
            GROUP BY tag_id
            </script>
            """)
    List<KnowledgeTagUsageCountView> findUsageCountsByTagIds(@Param("tagIds") List<UUID> tagIds);
}
