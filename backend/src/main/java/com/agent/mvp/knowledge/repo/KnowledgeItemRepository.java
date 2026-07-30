package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface KnowledgeItemRepository extends BaseMapper<KnowledgeItem> {

    @Insert(
            "<script>INSERT INTO knowledge_items(id, user_id, source_type, title, source_uri,"
                    + " content_hash, raw_content, cleaned_content, summary, status, language,"
                    + " word_count, created_at, updated_at, archived_at) VALUES "
                    + "<foreach collection='list' item='item' separator=','>"
                    + "(#{item.id,typeHandler=com.agent.mvp.config.UuidTypeHandler},"
                    + " #{item.userId,typeHandler=com.agent.mvp.config.UuidTypeHandler},"
                    + " #{item.sourceType}, #{item.title}, #{item.sourceUri}, #{item.contentHash},"
                    + " #{item.rawContent}, #{item.cleanedContent}, #{item.summary},"
                    + " #{item.status}, #{item.language}, #{item.wordCount}, #{item.createdAt},"
                    + " #{item.updatedAt}, #{item.archivedAt})"
                    + "</foreach></script>")
    int insertBatch(@Param("list") List<KnowledgeItem> list);

    @Results(
            id = "knowledgeItemStatusCountViewMap",
            value = {
                @Result(column = "status", property = "status"),
                @Result(column = "item_count", property = "itemCount")
            })
    @Select(
            "SELECT status, COUNT(*) AS item_count FROM knowledge_items "
                    + "WHERE user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler} "
                    + "GROUP BY status")
    List<KnowledgeItemStatusCountView> findStatusCountsByUserId(@Param("userId") UUID userId);
}
