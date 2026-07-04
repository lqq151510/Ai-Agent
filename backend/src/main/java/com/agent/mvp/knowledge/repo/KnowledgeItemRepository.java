package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface KnowledgeItemRepository extends BaseMapper<KnowledgeItem> {

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
