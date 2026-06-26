package com.agent.mvp.knowledge.repo;

import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeTagRepository extends BaseMapper<KnowledgeTag> {}
