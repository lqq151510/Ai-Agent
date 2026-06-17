package com.agent.mvp.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis-Plus 拦截器配置。
 *
 * <p>注册以下核心拦截器：
 *
 * <ul>
 *   <li>{@link OptimisticLockerInnerInterceptor}：乐观锁支持，处理 {@code @Version} 字段自动更新
 *   <li>{@link PaginationInnerInterceptor}：分页支持
 * </ul>
 *
 * <p>未注册 OptimisticLockerInnerInterceptor 会导致 {@code @Version} 字段更新时报错
 * "Parameter 'MP_OPTLOCK_VERSION_ORIGINAL' not found"。
 */
@Configuration
public class MybatisPlusConfig {

    /**
     * 配置 MyBatis-Plus 拦截器链。
     *
     * <p>注意：乐观锁拦截器必须在分页拦截器之前添加。
     *
     * @return MyBatis-Plus 主拦截器
     */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        // 乐观锁拦截器：处理 @Version 字段
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        // 分页拦截器：PostgreSQL 方言
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.POSTGRE_SQL));
        return interceptor;
    }
}
