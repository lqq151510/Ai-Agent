package com.agent.mvp.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.sql.DriverManager;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 桌面 profile 迁移专用断言（t8 / R1）。
 *
 * <p>t4 的独立复核发现：`MigrationLineageParityTest` 只守“版本集对齐 + 校验和基线 + 配置回归”， 并没有真正断言“桌面版从空库迁移成功、关键表存在、且
 * `ddl-auto: validate` 通过”。本测试补齐这一环， 并全部离线运行（H2 内存库，不依赖 Docker / Redis / 外部模型端点）。
 *
 * <p>覆盖两条路径：
 *
 * <ol>
 *   <li>Spring 上下文路径：`@ActiveProfiles({"desktop", "test"})` + `classpath:db/h2` + `validate`，
 *       上下文能启动本身就证明 H2 血统产出的 schema 足以装配全部 MyBatis-Plus mapper；
 *   <li>Flyway API 路径：绕过 Spring，直接对全新 H2 执行 `classpath:db/h2`，证明迁移本身独立可用。
 * </ol>
 *
 * <p><b>重要说明：</b>本项目已从 JPA 迁移到 MyBatis-Plus，`backend/src/main/java` 下 **没有任何 `@Entity` 类**，因此
 * `ddl-auto: validate` 实际是空转（Hibernate 无实体可校验）。所以本测试不依赖 `validate`，而是直接断言
 * `flyway_schema_history`、`information_schema.tables` 与 `information_schema.columns`，用真实 schema
 * 证据守住桌面版迁移。
 */
@DisplayName("桌面 profile Flyway 迁移：全量迁移成功 + 关键表/列存在 + 上下文可启动（ddl-auto=validate）")
@SpringBootTest(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:desktop_flyway_verify;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
            "spring.datasource.driver-class-name=org.h2.Driver",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
            "app.openai.base-url=http://127.0.0.1:18099/v1",
            "JWT_SECRET=desktop-flyway-verification-secret-key-32chars"
        })
@ActiveProfiles({"desktop", "test"})
class DesktopFlywayMigrationTest {

    private static final String H2_LOCATION = "classpath:db/h2";

    /** 桌面版必须存在的关键业务表（按 H2 血统实际 schema 归纳）。 */
    private static final Set<String> REQUIRED_TABLES =
            Set.of(
                    "users",
                    "conversation_sessions",
                    "messages",
                    "tool_audits",
                    "dev_coach_runs",
                    "user_profiles",
                    "model_sources",
                    "knowledge_items",
                    "knowledge_tags",
                    "knowledge_item_tags",
                    "ingestion_jobs",
                    "knowledge_source_assets",
                    "knowledge_review_states");

    /** 关键列（历次迁移新增/曾被漏掉或错位的字段），按 "表.列" 小写登记。 */
    private static final Set<String> REQUIRED_COLUMNS =
            Set.of(
                    "users.token_version",
                    "users.custom_base_url",
                    "users.custom_api_key",
                    "conversation_sessions.context_token_limit",
                    "conversation_sessions.task_type",
                    "conversation_sessions.task_goal",
                    "conversation_sessions.task_status",
                    "conversation_sessions.version",
                    "knowledge_items.content_hash",
                    "knowledge_source_assets.content_hash",
                    "knowledge_source_assets.availability",
                    "knowledge_review_states.due_at",
                    "knowledge_review_states.ease_factor");

    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("上下文以 ddl-auto=validate 启动，db/h2 全部迁移被标记成功且无 BASELINE 占位")
    void contextStartsAndAllMigrationsSucceed() throws IOException {
        int expected = migrationFileCount();
        assertTrue(expected >= 13, "db/h2 迁移文件数异常，期望 >= 13，实际 " + expected);

        Integer succeeded =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM \"flyway_schema_history\""
                                + " WHERE \"success\" = TRUE AND \"type\" = 'SQL'",
                        Integer.class);
        assertEquals(
                expected,
                succeeded,
                "success=TRUE 的 SQL 迁移条数应与 db/h2 迁移文件数一致（上下文能启动即说明 schema 可用）");

        Integer baselineRows =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM \"flyway_schema_history\""
                                + " WHERE \"type\" = 'BASELINE'",
                        Integer.class);
        assertEquals(0, baselineRows, "全新内存库不应出现 BASELINE 占位行（否则会跳过 V1）");
    }

    @Test
    @DisplayName("桌面版关键业务表全部存在")
    void keyTablesExist() {
        Set<String> normalized =
                jdbcTemplate
                        .queryForList(
                                "SELECT table_name FROM information_schema.tables"
                                        + " WHERE table_schema = 'PUBLIC'",
                                String.class)
                        .stream()
                        .map(name -> name.toLowerCase(Locale.ROOT))
                        .collect(Collectors.toCollection(TreeSet::new));

        Set<String> missing = new TreeSet<>(REQUIRED_TABLES);
        missing.removeAll(normalized);
        assertEquals(Set.of(), missing, "桌面版缺失关键表：" + missing);
    }

    @Test
    @DisplayName("桌面版关键列全部存在（覆盖历次迁移新增字段）")
    void keyColumnsExist() {
        Set<String> actual =
                new TreeSet<>(
                        jdbcTemplate.query(
                                "SELECT table_name, column_name FROM information_schema.columns"
                                        + " WHERE table_schema = 'PUBLIC'",
                                (rs, rowNum) ->
                                        (rs.getString("table_name")
                                                        + "."
                                                        + rs.getString("column_name"))
                                                .toLowerCase(Locale.ROOT)));

        Set<String> missing = new TreeSet<>(REQUIRED_COLUMNS);
        missing.removeAll(actual);
        assertEquals(Set.of(), missing, "桌面版缺失关键列：" + missing);
    }

    @Test
    @DisplayName("Flyway API 绕过 Spring，直接对全新 H2 执行 classpath:db/h2 迁移成功")
    void flywayApiMigratesFreshDatabase() throws Exception {
        int expected = migrationFileCount();
        String url = "jdbc:h2:mem:desktop_flyway_api;DB_CLOSE_DELAY=-1";

        var result =
                Flyway.configure()
                        .dataSource(url, "sa", "")
                        .locations(H2_LOCATION)
                        .load()
                        .migrate();
        assertEquals(expected, result.migrationsExecuted, "应执行 db/h2 下全部迁移");

        try (var connection = DriverManager.getConnection(url, "sa", "");
                var statement = connection.createStatement();
                var rows =
                        statement.executeQuery(
                                "SELECT COUNT(*) FROM information_schema.tables"
                                        + " WHERE table_schema = 'PUBLIC'")) {
            assertTrue(rows.next(), "无法读取 information_schema.tables");
            assertTrue(
                    rows.getInt(1) >= REQUIRED_TABLES.size(),
                    "迁移后 PUBLIC schema 表数量不足，实际 " + rows.getInt(1));
        }
    }

    private static int migrationFileCount() throws IOException {
        return new PathMatchingResourcePatternResolver()
                .getResources(H2_LOCATION + "/*.sql")
                .length;
    }
}
