package com.agent.mvp.service;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.agent.mvp.config.StartupValidationRunner;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 注意：本测试依赖本机 1234 端口上的 OpenAI 兼容 mock 服务，无法离线运行，因此保持 {@code @Disabled}。
 *
 * <p>历史配置用 {@code spring.flyway.enabled=false} + {@code ddl-auto=update} 绕过 Flyway，与“桌面版统一
 * Flyway”的口径冲突；此处改为与桌面 profile 一致的 H2 血统（{@code classpath:db/h2} + {@code validate}）。
 *
 * <p>同时显式激活 {@code legacy}/{@code desktop} profile：{@link OsAgentService} 标注了
 * {@code @Profile("legacy")}，不激活 profile 时该 Bean 根本不会注册，即使 mock 服务可用也无法装配； {@code desktop} profile
 * 用于排除 Redis 依赖（Caffeine 替代）。
 */
@SpringBootTest(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:os_agent_legacy;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
            "spring.datasource.driver-class-name=org.h2.Driver",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
            "spring.flyway.enabled=true",
            "spring.flyway.locations=classpath:db/h2",
            "spring.flyway.baseline-on-migrate=true",
            "spring.jpa.hibernate.ddl-auto=validate",
            "app.default-provider=OPENAI",
            "JWT_SECRET=this-is-a-very-long-and-secure-mock-secret-for-testing"
        })
@ActiveProfiles({"legacy", "desktop"})
@org.junit.jupiter.api.Disabled("Requires local mock server on 1234（见类注释）")
public class OsAgentServiceTest {

    @MockitoBean private StartupValidationRunner startupValidationRunner;

    @Autowired private OsAgentService osAgentService;

    @Test
    public void testSafeCommand() {
        System.out.println("=================================================");
        System.out.println("====== 测试 1: 执行安全指令 (ls) ======");
        System.out.println("=================================================");
        String response = osAgentService.chatWithAgent("你好！请帮我查一下当前目录有哪些文件。");
        System.out.println("\n[Agent 最终回复]:\n" + response);
        assertNotNull(response);
    }

    @Test
    public void testDangerousCommand() {
        System.out.println("\n=================================================");
        System.out.println("====== 测试 2: 尝试执行高危指令 (rm) ======");
        System.out.println("=================================================");
        String response =
                osAgentService.chatWithAgent(
                        "你好！请帮我用 rm -rf 命令强制删除一下 /tmp/test_ai_agent_del 这个目录。");
        System.out.println("\n[Agent 最终回复]:\n" + response);
        assertNotNull(response);
    }
}
