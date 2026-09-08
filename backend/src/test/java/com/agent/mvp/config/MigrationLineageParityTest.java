package com.agent.mvp.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * Flyway 迁移血统守卫。
 *
 * <p>本仓库存在两条独立迁移血统：
 *
 * <ul>
 *   <li>{@code db/migration}：服务端 PostgreSQL 血统（server profile）
 *   <li>{@code db/h2}：桌面版 H2 血统（desktop profile，见 application-desktop.yml）
 * </ul>
 *
 * <p>两条血统的版本号语义并不一一对应（详见 {@code docs/arch/005-database-migration-strategy.md}）。
 * 本测试只守三件事，避免分叉继续扩大或在发布后偷改迁移：
 *
 * <ol>
 *   <li>两条血统的版本号集合必须一致；单侧存在的版本必须显式登记。
 *   <li>每个已发布迁移文件的 SHA-256 必须与 {@code migration-checksums.txt} 基线一致
 *       （Flyway 对已应用迁移的 checksum mismatch 会让用户端直接启动失败）。
 *   <li>桌面 profile 不得回退到 {@code ddl-auto: update}，也不得丢掉 Flyway 配置。
 * </ol>
 */
@DisplayName("Flyway 迁移血统守卫：版本集对齐 + 校验和基线 + 桌面配置回归")
class MigrationLineageParityTest {

    private static final String PG_LOCATION = "db/migration";
    private static final String H2_LOCATION = "db/h2";
    private static final String CHECKSUM_BASELINE = "migration-checksums.txt";
    private static final Pattern MIGRATION_FILENAME = Pattern.compile("^(V\\d+)__.+$");

    /**
     * 允许只存在于单侧血统的版本号。新增分叉必须先在此登记，并同步 docs/arch/005-database-migration-strategy.md。
     * 当前两条血统版本号集合一致（V1–V13），故为空。
     */
    private static final Set<String> INTENTIONALLY_ONE_SIDED = Set.of();

    @Test
    @DisplayName("两条血统的版本号集合必须一致，单侧分叉必须显式登记")
    void versionSetsMustStayAligned() throws IOException {
        Set<String> pgVersions = versionsIn(PG_LOCATION);
        Set<String> h2Versions = versionsIn(H2_LOCATION);

        assertFalse(pgVersions.isEmpty(), PG_LOCATION + " 下未找到任何迁移文件");
        assertFalse(h2Versions.isEmpty(), H2_LOCATION + " 下未找到任何迁移文件");

        Set<String> pgOnly = new TreeSet<>(pgVersions);
        pgOnly.removeAll(h2Versions);
        pgOnly.removeAll(INTENTIONALLY_ONE_SIDED);

        Set<String> h2Only = new TreeSet<>(h2Versions);
        h2Only.removeAll(pgVersions);
        h2Only.removeAll(INTENTIONALLY_ONE_SIDED);

        assertEquals(
                Set.of(),
                pgOnly,
                "db/migration 中这些版本在 db/h2 缺失：" + pgOnly
                        + "。桌面版只加载 classpath:db/h2，缺失会让新表在桌面端不存在；"
                        + "请补 H2 等价迁移，或登记到 INTENTIONALLY_ONE_SIDED 并更新 docs/arch/005。");
        assertEquals(
                Set.of(),
                h2Only,
                "db/h2 中这些版本在 db/migration 缺失：" + h2Only
                        + "。请补服务端等价迁移，或登记到 INTENTIONALLY_ONE_SIDED 并更新 docs/arch/005。");
    }

    @Test
    @DisplayName("已发布迁移文件不得被修改，新增迁移必须登记进校验和基线")
    void releasedMigrationsMustNotBeEdited() throws Exception {
        Map<String, String> baseline = readChecksumBaseline();
        List<String> failures = new ArrayList<>();

        for (Map.Entry<String, String> entry : baseline.entrySet()) {
            Resource resource = resolver().getResource("classpath:" + entry.getKey());
            if (!resource.exists()) {
                failures.add(entry.getKey() + "：基线中登记但文件已不存在");
                continue;
            }
            String actual = sha256(resource.getInputStream());
            if (!Objects.equals(entry.getValue(), actual)) {
                failures.add(
                        entry.getKey() + "：内容已变更（baseline=" + entry.getValue() + "，actual=" + actual + "）");
            }
        }

        for (String file : allMigrationFiles()) {
            if (!baseline.containsKey(file)) {
                failures.add(file + "：新增迁移但未登记进 migration-checksums.txt");
            }
        }

        assertEquals(
                List.of(),
                failures,
                "已发布迁移被修改或基线未更新。已执行过的迁移不可改（Flyway checksum mismatch 会导致用户端启动失败）；"
                        + "请改为新增 V<N+1>，并运行 scripts/check-migration-parity.sh --update 更新基线。");
    }

    @Test
    @DisplayName("桌面 profile 必须启用 Flyway 且 ddl-auto=validate")
    void desktopProfileMustKeepFlywayAndValidate() throws IOException {
        String yaml = readText("classpath:application-desktop.yml");

        assertTrue(
                Pattern.compile("flyway:\\s*\\n\\s+enabled:\\s*true").matcher(yaml).find(),
                "application-desktop.yml 的 spring.flyway.enabled 必须为 true");
        assertTrue(
                yaml.contains("locations: classpath:db/h2"),
                "桌面版 Flyway locations 必须为 classpath:db/h2（H2 血统）");
        assertTrue(
                yaml.contains("baseline-on-migrate: true"),
                "桌面版必须保留 baseline-on-migrate: true 以兼容既有本地库");
        assertTrue(yaml.contains("ddl-auto: validate"), "桌面版 jpa.hibernate.ddl-auto 必须为 validate");
        assertFalse(
                yaml.contains("ddl-auto: update"),
                "桌面版不得回退到 ddl-auto: update（会造成 schema 漂移）");
    }

    private static Set<String> versionsIn(String location) throws IOException {
        Set<String> versions = new TreeSet<>();
        for (Resource resource : resolver().getResources("classpath*:" + location + "/*.sql")) {
            String filename = resource.getFilename();
            assertNotNull(filename, location + " 下存在无法解析文件名的迁移资源");
            Matcher matcher = MIGRATION_FILENAME.matcher(filename);
            assertTrue(matcher.matches(), "迁移文件名不符合 V<number>__<desc>.sql 约定：" + filename);
            versions.add(matcher.group(1));
        }
        return versions;
    }

    private static Set<String> allMigrationFiles() throws IOException {
        Set<String> files = new TreeSet<>();
        for (String location : List.of(PG_LOCATION, H2_LOCATION)) {
            for (Resource resource : resolver().getResources("classpath*:" + location + "/*.sql")) {
                String filename = resource.getFilename();
                if (filename != null) {
                    files.add(location + "/" + filename);
                }
            }
        }
        return files;
    }

    private static Map<String, String> readChecksumBaseline() throws IOException {
        Map<String, String> baseline = new LinkedHashMap<>();
        for (String line : readText("classpath:" + CHECKSUM_BASELINE).split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            String[] parts = trimmed.split("\\s+");
            assertEquals(2, parts.length, "校验和基线行格式错误（应为 <path> <sha256>）：" + trimmed);
            baseline.put(parts[0], parts[1]);
        }
        assertFalse(baseline.isEmpty(), CHECKSUM_BASELINE + " 为空");
        return baseline;
    }

    private static String readText(String location) throws IOException {
        Resource resource = resolver().getResource(location);
        assertTrue(resource.exists(), "找不到资源：" + location);
        try (InputStream input = resource.getInputStream()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String sha256(InputStream input) throws IOException, NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (input) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) {
            hex.append(String.format("%02x", value & 0xff));
        }
        return hex.toString();
    }

    private static PathMatchingResourcePatternResolver resolver() {
        return new PathMatchingResourcePatternResolver();
    }
}
