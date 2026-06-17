package com.agent.mvp.config;

import com.agent.mvp.session.service.SessionService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 自定义业务指标配置。
 *
 * <p>注册以下指标供 AgentService / CoachService 埋点使用：
 *
 * <ul>
 *   <li>{@code agent.chat.requests} (Counter, tags: provider, model) - Agent 对话请求总数
 *   <li>{@code agent.chat.errors} (Counter, tags: provider, model) - Agent 对话错误总数
 *   <li>{@code agent.chat.duration} (Timer, tags: provider) - Agent 对话耗时分布
 *   <li>{@code agent.sessions.active} (Gauge) - 当前活跃会话数（来自 SessionService）
 *   <li>{@code coach.scaffolds.generated} (Counter) - Coach 脚手架生成总数
 *   <li>{@code coach.requirements.broken.down} (Counter) - Coach 需求拆解总数
 * </ul>
 *
 * <p>说明：带 tag 的 Counter/Timer 由业务代码通过 {@link
 * com.agent.mvp.config.MetricsSupport#chatRequests}, {@link
 * com.agent.mvp.config.MetricsSupport#chatErrors}, {@link
 * com.agent.mvp.config.MetricsSupport#chatDuration} 等 helper 方法动态构建，以确保 tag
 * 值随实际 provider/model 变化。
 */
@Configuration
public class MetricsConfig {

    /**
     * 活跃会话数 Gauge 绑定器。
     *
     * <p>通过 {@link SessionService#countActiveSessions()} 实时获取活跃会话数，注册为 {@code
     * agent.sessions.active} 指标。
     */
    @Bean
    public MeterBinder activeSessionsGauge(SessionService sessionService) {
        return registry ->
                registry.gauge(
                        "agent.sessions.active",
                        io.micrometer.core.instrument.Tags.empty(),
                        sessionService,
                        SessionService::countActiveSessions);
    }
}
