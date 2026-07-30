package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface KnowledgeTagRepository extends BaseMapper<KnowledgeTag> {

    @Insert(
            """
            <script>
            INSERT INTO knowledge_tags(id, user_id, name, color, created_at) VALUES
            <foreach collection="tags" item="tag" separator=",">
            (#{tag.id,typeHandler=com.agent.mvp.config.UuidTypeHandler},
             #{tag.userId,typeHandler=com.agent.mvp.config.UuidTypeHandler},
             #{tag.name}, #{tag.color}, #{tag.createdAt})
            </foreach>
            </script>
            """)
    int insertBatch(@Param("tags") List<KnowledgeTag> tags);
}
