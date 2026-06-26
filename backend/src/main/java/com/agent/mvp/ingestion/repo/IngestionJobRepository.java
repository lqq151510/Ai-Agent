package com.agent.mvp.ingestion.repo;

import com.agent.mvp.ingestion.entity.IngestionJob;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface IngestionJobRepository extends BaseMapper<IngestionJob> {}
