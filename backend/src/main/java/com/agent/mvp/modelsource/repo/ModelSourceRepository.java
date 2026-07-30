package com.agent.mvp.modelsource.repo;

import com.agent.mvp.modelsource.entity.ModelSource;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ModelSourceRepository extends BaseMapper<ModelSource> {

    @Update(
            "UPDATE model_sources SET is_default = false, updated_at = #{now} "
                    + "WHERE user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler} "
                    + "AND is_default = true")
    int clearDefaultByUserId(@Param("userId") UUID userId, @Param("now") Instant now);

    @Update(
            "UPDATE model_sources SET is_default ="
                    + " (id = #{targetId,typeHandler=com.agent.mvp.config.UuidTypeHandler}),"
                    + " updated_at = #{now} "
                    + "WHERE user_id = #{userId,typeHandler=com.agent.mvp.config.UuidTypeHandler}")
    int syncDefault(
            @Param("userId") UUID userId,
            @Param("targetId") UUID targetId,
            @Param("now") Instant now);
}
