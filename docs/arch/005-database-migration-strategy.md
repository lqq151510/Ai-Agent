# 数据库迁移策略：双 Flyway 血统的现状、守卫与演进路径

> 版本：v1.0 | 日期：2026-09-08 | 状态：已决策（方案 B 落地，方案 A 列为后续演进）
> 相关实现：`backend/src/main/resources/db/migration`、`backend/src/main/resources/db/h2`、
> `MigrationLineageParityTest`、`scripts/check-migration-parity.sh`

---

## 1. 结论先行

1. **桌面版已经在跑 Flyway**，不是 `ddl-auto: update`：
   `application-desktop.yml` → `spring.flyway.enabled: true`、`locations: classpath:db/h2`、
   `baseline-on-migrate: true`、`spring.jpa.hibernate.ddl-auto: validate`。
   （"桌面版不用 Flyway / 禁用 Flyway"的旧计划实际出自 `.trae/documents/desktop-client-plan.md`（2026-05，第 50–51 行），已作废；经 `git log --all -p -- PROJECT_MEMORY.md` 全历史核查，`PROJECT_MEMORY.md` 从未包含该表述。）
2. 但仓库存在**两条独立迁移血统**：服务端 PostgreSQL 线 `db/migration` 与桌面版 H2 线 `db/h2`。
   两者版本号相同、语义并**不**一一对应，属于长期维护风险。
3. 本轮**不做**血统合并（方案 A）。原因是存量桌面库的 `flyway_schema_history` 已记录 `db/h2` 的
   V1–V13 校验和，直接换目录/改名/编辑旧文件会让用户端启动即失败，需要配套 repair/升级桥，
   属于发布工程而不是本轮范围。
4. 本轮落地**方案 B**：把分叉纳入 CI 拦截 + 记录校验和基线 + 把方案 A 的升级路径写清楚。

---

## 2. 现状

| 维度 | 服务端 | 桌面版 |
|---|---|---|
| Profile | 默认（`application.yml`） | `desktop`（`application-desktop.yml`） |
| 数据库 | PostgreSQL（`jdbc:postgresql://...`） | H2 文件库 `~/.ai-agent-desktop/db;AUTO_SERVER=TRUE` |
| Flyway locations | `classpath:db/migration` | `classpath:db/h2` |
| ddl-auto | `validate` | `validate` |
| 迁移数量 | V1–V13（13 个） | V1–V13（13 个） |
| 校验和基线 | `backend/src/test/resources/migration-checksums.txt` | 同上 |

> 注（2026-09-08 实测）：`ddl-auto: validate` 在本项目**实际是空转** —— JPA 迁到 MyBatis-Plus 之后
> `backend/src/main/java` 下已无 `@Entity`，Hibernate 没有实体可校验。因此"validate 通过"**不能**当作
> schema 正确性的证据；`DesktopFlywayMigrationTest` 已改为直接断言 `information_schema` 的表与列。

---

## 3. 语义错位表（已用 SHA-256 与内容核对）

| 服务端 `db/migration` | 桌面版 `db/h2` | 关系（证据） |
|---|---|---|
| V1 init_schema（无 `token_version`） | V1 init_schema（**已含 `token_version`**） | H2 为**压缩基线**，V1 就吸收了服务端 V1+V2 的效果 |
| V2 refresh_token_rotation | — | **H2 侧没有对应文件**（效果并入 H2 V1） |
| V3 dev_coach_runs | V2 dev_coach_runs | 内容相同，**版本号错位** |
| V4 session_context_token_limit | V3 session_context_token_limit | 内容相同（SHA 一致），**版本号错位** |
| V7 add_session_workflow_fields | V4 session_workflow_fields | 内容相同（SHA 一致），**版本号错位** |
| V5 / V6 / V8 / V9 | V5 / V6 / V8 / V9 | 版本号相同，DDL 因方言不同而不同 |
| V10 knowledge_retrieval_indexes | V10 同名 | 服务端含 `USING GIN (to_tsvector('simple', ...))`；**H2 无全文索引 → 桌面版全文检索能力降级** |
| V11 content_hash 去重 | V11 同名 | 服务端是部分唯一索引（`WHERE content_hash IS NOT NULL`），H2 是普通唯一索引（语义等价） |
| V12 knowledge_source_assets | V12 同名 | **逐字节一致** |
| V13 knowledge_review_states | V13 同名 | 仅 `IF NOT EXISTS` 有无之别 |

补充事实（修正此前的口头判断）：

- `db/h2/V4` 与 `db/h2/V7` **并不完全相同**：V4 只加 `task_type/task_goal/task_status` 三列；
  V7 重复这三列（`IF NOT EXISTS` 兜底）并追加默认值回填。即 **H2 V4 是 H2 V7 的子集**。
  两条血统都能跑通，但存在语义重叠，后续新增字段时需注意别把回填逻辑漏在旧版本里。

---

## 4. 为什么不能简单"合并成一条血统"

1. **方言不兼容（已实测，真正阻塞只有两处）**：在 H2 2.3.232 上
   `USING GIN (...)` 报 `Syntax error ... expected "BTREE, HASH, RTREE"`；
   部分索引 `... WHERE content_hash IS NOT NULL` 报 `42000` 语法错误。
   把桌面版 locations 直接指向 `db/migration` 会在 `V10__knowledge_retrieval_indexes.sql` 处失败。
   注：`TIMESTAMP WITH TIME ZONE` 在 H2 2.3.232 上**是支持的**，不构成阻塞（早期判断有误，已更正）。
2. **两个 locations 同时加载会因版本号冲突直接启动失败**（实测）：
   `locations: classpath:db/migration,classpath:db/h2` →
   `FlywayException: Found more than one migration with version 1`
   （offenders：`db/migration/V1__init_schema.sql`、`db/h2/V1__init_schema.sql`）。
   即"把两套脚本拼在一起"从 V1 就走不通，不要尝试。
3. **存量桌面库会被判 checksum mismatch**：已安装用户本地 `flyway_schema_history` 里是 `db/h2`
   V1–V13 的校验和。改 location、改名、编辑已应用文件都会让 Flyway 拒绝启动；
   `baseline-on-migrate: true` 不能绕过 validate，当前配置也没有 `validate-on-migrate: false` 或 repair 钩子。
4. **存量库的 V1 其实从未执行**（实测本机 `~/.ai-agent-desktop/db.mv.db`）：历史记录为
   `BASELINE(v1)` + H2 `V2..V13`，即基础表来自 Flyway 之前的 `ddl-auto=update` 时代，
   `baseline-on-migrate: true` 把"非空但无历史表"的库静默 baseline 到 V1 并跳过 V1。
   因此对升级用户而言 **H2 V1 不是权威 schema**；后续若要收敛，应提供一个幂等的 V14 补基础表。
5. **`engineering_memory` 不在 Flyway 管辖内**：该表由 langchain4j `PgVectorEmbeddingStore` 运行时创建
   （`vector(384)` 列 + `vector` 扩展），`EmbeddingStoreProvider.initializeFtsIndex()` 还会运行时
   `CREATE INDEX ... USING GIN`。统一迁移前必须先决定这张表归谁管，否则"单一真源"是假的。

---

## 5. 本轮落地的守卫（方案 B）

| 机制 | 位置 | 作用 |
|---|---|---|
| 版本集对齐断言 | `MigrationLineageParityTest#versionSetsMustStayAligned` | 任一侧新增版本而另一侧缺失即失败；单侧分叉必须登记进 `INTENTIONALLY_ONE_SIDED` |
| 校验和基线 | `backend/src/test/resources/migration-checksums.txt` + `releasedMigrationsMustNotBeEdited` | 旧迁移被改动 / 新增迁移未登记即失败 |
| 桌面配置回归 | `desktopProfileMustKeepFlywayAndValidate` | 防止有人把桌面版改回 `ddl-auto: update` 或换掉 `classpath:db/h2` |
| 命令行守卫 | `scripts/check-migration-parity.sh [--check\|--update]` | 本地/CI 同源校验；`--update` 重生成基线 |

维护动作约定：

- **新增迁移**：两条血统都要加同名版本号（语义可不同），然后 `scripts/check-migration-parity.sh --update`。
- **单侧新增**（例如只有服务端需要的索引）：先登记到 `ALLOW_ONE_SIDED`（脚本）与
  `INTENTIONALLY_ONE_SIDED`（测试），并在本文档补一行说明原因。
- **已发布迁移**：只可新增，不可修改。

---

## 6. 方案 A（未来统一血统）的升级路径

前置条件：确认要支持"桌面库从 db/h2 平滑迁移到统一血统"，且愿意为老用户提供升级脚本。

1. 新增 `db/migration-vendor/postgres`，把 PG-only 语句从 `db/migration` 拆出；
   `db/migration` 只保留 H2/PG 双方可用的 DDL。
2. 服务端 locations 改为 `classpath:db/migration,classpath:db/migration-vendor/postgres`；
   桌面版只用 `classpath:db/migration`。
3. 追加一个**升级桥版本**（如 V14），在桌面侧为 no-op，用于对齐版本号。
4. 提供一次性 repair/迁移脚本：读取本地 `flyway_schema_history`，把 `db/h2` 的 V1–V13 记录
   重写为统一血统的校验和（或直接 `flyway repair` + 手工插入基线记录）。
   该脚本必须有 dry-run、备份（复制 `~/.ai-agent-desktop/db.mv.db`）与失败回滚。
5. 在 `engineering_memory` 归属确定前，不要把它纳入迁移脚本。
6. 升级后跑：桌面 profile 启动 + 五步核心链路 e2e + 旧库回归。

风险与成本：一次性的用户数据迁移风险、需要发布说明与回滚方案、需要同时维护两套 locations 一段时间。
**本轮不做。**

---

## 7. 验证命令

```bash
# 命令行守卫
bash scripts/check-migration-parity.sh

# CI 守卫（Java 侧）
cd backend && mvn -o -pl backend -am \
  -Dtest='MigrationLineageParityTest' -Dsurefire.failIfNoSpecifiedTests=false test

# 桌面 profile 真实迁移验证（H2 内存）
cd backend && mvn -o -pl backend -am \
  -Dtest='EndToEndFlowTest' -Dsurefire.failIfNoSpecifiedTests=false test
```

`EndToEndFlowTest` 使用 `@ActiveProfiles({"desktop","test","legacy"})` 与 `application-test.yml`
（H2 内存 + Flyway `classpath:db/h2` + `ddl-auto=validate`），可作为桌面迁移是否可用的端到端证据。
