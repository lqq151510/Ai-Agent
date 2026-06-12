package com.agent.mvp.auth.repo;

import com.agent.mvp.auth.entity.User;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

import java.util.Optional;
import java.util.UUID;

@Mapper
public interface UserRepository extends BaseMapper<User> {
}
