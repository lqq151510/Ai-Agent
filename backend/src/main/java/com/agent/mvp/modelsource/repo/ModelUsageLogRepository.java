package com.agent.mvp.modelsource.repo;

import com.agent.mvp.modelsource.entity.ModelUsageLog;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ModelUsageLogRepository extends BaseMapper<ModelUsageLog> {}
