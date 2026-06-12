package com.agent.mvp.tooling.repo;

import com.agent.mvp.tooling.entity.ToolAudit;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Mapper
public interface ToolAuditRepository extends BaseMapper<ToolAudit> {
}
