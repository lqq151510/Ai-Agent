package com.agent.mvp.coach.repo;

import com.agent.mvp.coach.entity.DevCoachRun;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.UUID;

@Mapper
public interface DevCoachRunRepository extends BaseMapper<DevCoachRun> {
}
