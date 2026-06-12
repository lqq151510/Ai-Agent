package com.agent.mvp.auth.service;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.repo.UserRepository;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.UUID;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Cacheable(value = "users", key = "#id")
    public User getUserById(UUID id) {
        if (id == null) return null;
        return userRepository.selectById(id);
    }

    @Cacheable(value = "users_by_email", key = "#email")
    public User getUserByEmail(String email) {
        if (email == null) return null;
        return userRepository.selectOne(new LambdaQueryWrapper<User>().eq(User::getEmail, email));
    }

    public boolean existsByEmail(String email) {
        if (email == null) return false;
        return userRepository.selectCount(new LambdaQueryWrapper<User>().eq(User::getEmail, email))
                > 0;
    }

    @CachePut(value = "users", key = "#user.id")
    @CacheEvict(value = "users_by_email", key = "#user.email")
    public User createUser(User user) {
        user.onCreate();
        userRepository.insert(user);
        return user;
    }

    @CachePut(value = "users", key = "#user.id")
    @CacheEvict(value = "users_by_email", key = "#user.email")
    public User updateUser(User user) {
        userRepository.updateById(user);
        return user;
    }
}
