package com.agent.sentinel;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记需要被 Bug Sentinel 上报异常的 Controller 方法或类。
 *
 * <p>该注解本身不强制启用 AOP 拦截（保持接入零侵入），主要用于：
 * <ul>
 *   <li>文档化哪些端点需要主动上报异常</li>
 *   <li>未来通过 {@code SentinelWebhookAspect} 扩展为方法级精准上报</li>
 *   <li>配合 {@link GlobalSentinelExceptionHandler} 实现全局兜底 + 方法级标记的双重保障</li>
 * </ul>
 *
 * <p>使用示例：
 * <pre>{@code
 * @PostMapping("/execute-multi-agent")
 * @SentinelWebhook
 * public ResponseEntity<String> executeMultiAgent(...) { ... }
 * }</pre>
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface SentinelWebhook {

    /** 是否对该方法/类启用异常上报，默认 true。可设为 false 临时禁用某个端点的上报。 */
    boolean enabled() default true;

    /** 该端点的业务标签，便于在告警平台区分来源，例如 "coach" / "auth"。 */
    String tag() default "";
}
