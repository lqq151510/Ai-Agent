package com.agent.mvp.config;

import com.agent.mvp.agent.ModelProviderType;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

/**
 * 业务指标埋点工具。
 *
 * <p>提供带动态 tag 的 Counter / Timer 获取方法，确保 tag 值随实际 provider/model 变化。 Micrometer 会对相同 name+tags
 * 的指标做去重，重复 register 返回已存在的实例。
 */
public final class MetricsSupport {

    private MetricsSupport() {}

    /** 获取 Agent 对话请求计数器（按 provider/model 维度）。 */
    public static Counter chatRequests(
            MeterRegistry registry, ModelProviderType provider, String model) {
        return Counter.builder("agent.chat.requests")
                .description("Agent 对话请求总数")
                .tag("provider", provider == null ? "unknown" : provider.name())
                .tag("model", model == null ? "unknown" : model)
                .register(registry);
    }

    /** 获取 Agent 对话错误计数器（按 provider/model 维度）。 */
    public static Counter chatErrors(
            MeterRegistry registry, ModelProviderType provider, String model) {
        return Counter.builder("agent.chat.errors")
                .description("Agent 对话错误总数")
                .tag("provider", provider == null ? "unknown" : provider.name())
                .tag("model", model == null ? "unknown" : model)
                .register(registry);
    }

    /** 获取 Agent 对话耗时计时器（按 provider 维度）。 */
    public static Timer chatDuration(MeterRegistry registry, ModelProviderType provider) {
        return Timer.builder("agent.chat.duration")
                .description("Agent 对话耗时分布")
                .tag("provider", provider == null ? "unknown" : provider.name())
                .register(registry);
    }

    /** 获取 Coach 脚手架生成计数器。 */
    public static Counter coachScaffoldsGenerated(MeterRegistry registry) {
        return Counter.builder("coach.scaffolds.generated")
                .description("Coach 脚手架生成总数")
                .register(registry);
    }

    /** 获取 Coach 需求拆解计数器。 */
    public static Counter coachRequirementsBrokenDown(MeterRegistry registry) {
        return Counter.builder("coach.requirements.broken.down")
                .description("Coach 需求拆解总数")
                .register(registry);
    }
}
