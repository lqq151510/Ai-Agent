package com.agent.mvp.session.repo;

import com.agent.mvp.session.entity.ConversationSession;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ConversationSessionRepository extends BaseMapper<ConversationSession> {}
