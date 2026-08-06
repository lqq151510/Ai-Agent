package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.Instant;
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

    @Select(
            """
            SELECT ki.id, ki.user_id, ki.source_type, ki.title, ki.summary, ki.status, ki.updated_at
            FROM knowledge_review_states review_state
            JOIN knowledge_items ki ON ki.id = review_state.knowledge_item_id
            WHERE review_state.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND review_state.due_at <= #{now}
              AND ki.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND ki.status = 'ready'
            ORDER BY review_state.due_at ASC, ki.updated_at DESC
            LIMIT #{limit}
            """)
    List<KnowledgeItem> findDueReviewItems(
            @Param("userId") UUID userId, @Param("now") Instant now, @Param("limit") int limit);

    @Select(
            """
            SELECT ki.id, ki.user_id, ki.source_type, ki.title, ki.summary, ki.status, ki.updated_at
            FROM knowledge_items ki
            WHERE ki.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND ki.status = 'ready'
              AND NOT EXISTS (
                  SELECT 1
                  FROM knowledge_review_states review_state
                  WHERE review_state.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
                    AND review_state.knowledge_item_id = ki.id
              )
            ORDER BY ki.updated_at DESC
            LIMIT #{limit}
            """)
    List<KnowledgeItem> findUnreviewedReadyItems(
            @Param("userId") UUID userId, @Param("limit") int limit);

    @Select(
            """
            SELECT COUNT(*)
            FROM knowledge_review_states review_state
            JOIN knowledge_items ki ON ki.id = review_state.knowledge_item_id
            WHERE review_state.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND review_state.due_at <= #{now}
              AND ki.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND ki.status = 'ready'
            """)
    long countDueReviewItems(@Param("userId") UUID userId, @Param("now") Instant now);

    @Select(
            """
            SELECT COUNT(*)
            FROM knowledge_items ki
            WHERE ki.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND ki.status = 'ready'
              AND NOT EXISTS (
                  SELECT 1
                  FROM knowledge_review_states review_state
                  WHERE review_state.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
                    AND review_state.knowledge_item_id = ki.id
              )
            """)
    long countUnreviewedReadyItems(@Param("userId") UUID userId);

    @Select(
            """
            SELECT MIN(review_state.due_at)
            FROM knowledge_review_states review_state
            JOIN knowledge_items ki ON ki.id = review_state.knowledge_item_id
            WHERE review_state.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND ki.user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}
              AND ki.status = 'ready'
            """)
    Instant findNextReviewDueAt(@Param("userId") UUID userId);

    @Select(
            "SELECT id, user_id, status FROM knowledge_items "
                    + "WHERE id = #{itemId,typeHandler=com.agent.mvp.config.UuidTypeHandler} FOR UPDATE")
    KnowledgeItem findForReviewCompletion(@Param("itemId") UUID itemId);
}
