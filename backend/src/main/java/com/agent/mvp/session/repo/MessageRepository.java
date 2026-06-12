package com.agent.mvp.session.repo;

import com.agent.mvp.session.entity.Message;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.UUID;

@Mapper
public interface MessageRepository extends BaseMapper<Message> {
}
