# 下一 Beta 候选：验证边界与基准协议

这是一份候选准备记录，不是发布公告。当前 `desktop/package.json`、根 POM 和 `backend/pom.xml` 仍为 `0.1.0-beta.2`；仓库没有 `v0.1.0-beta.3` tag、安装包或 GitHub Release。已发布的 Beta.2 证据仍以 [`EVIDENCE.md`](EVIDENCE.md) 中的 tag、manifest 和 SHA-256 为准。

## 当前可复现基线

基线提交：`main@344b7402af76f20d1898cd4c68cd8ba3e14045fc`（2026-08-27，已推送）。

| 范围 | 命令或证据 | 当前结果 | 结论边界 |
| --- | --- | --- | --- |
| 后端 | `mvn --settings .mvn/settings.xml -pl backend -am clean verify` | `backend` 344 tests，0 failure，0 error，9 skipped；`bug-sentinel-starter` 4 tests 通过 | JaCoCo 行 76.39%（5543/7256）、分支 62.87%（1649/2623），只代表该提交的后端源码 |
| Renderer | Node 22 显式 PATH 下 lint、Vitest、Vite build | 35 tests 通过，构建通过 | 不外推为安装包 GUI smoke |
| Electron Main | `npm run test:main` | 25 tests 通过 | 覆盖 IPC、路径、导入、后端附着与打包保护，不等于真实 `.app` 启动 |
| 本地向量索引 | `EmbeddingStoreProviderTest`、`PersistentInMemoryEmbeddingStoreTest` | 4 个针对性测试通过 | 覆盖持久化、恢复、损坏快照隔离和语义缓存瞬态边界 |
| 包内资源布局 | `npm run test:packaged` | 当前候选通过；Electron 43.1.1 / electron-builder 26.15.7，`app.asar`、backend JAR、bundled JRE 布局通过 | 只证明物理布局，不等于签名、DMG/ZIP 或 GUI 交互 |
| 安装包启动 | 从 `.app` 内置 JRE 启动后端并轮询 readiness | 当前候选已返回 HTTP 200、`ready=true`；数据库/内存 Redis 通过，模型不可用按可选依赖处理；日志确认 `engineering_memory` 使用持久化索引 | 该次 shell smoke 没有人工观察窗口像素和完整 UI 交互，仍需 GUI 人工回归 |

## 本地向量索引的行为边界

Desktop Profile 关闭 PgVector 或连接失败时，主索引 `engineering_memory` 使用 `PersistentInMemoryEmbeddingStore`。默认快照路径是 `${app.data-dir}/vector-store/engineering_memory.json`，也可以通过 `DESKTOP_VECTOR_STORE_DIR` 指定目录。

- `add`、`addAll` 和删除操作完成后写入完整 JSON 快照，先写临时文件，再优先使用原子替换。
- 进程重启会恢复快照；语义缓存 `semantic_cache` 仍使用瞬态 `InMemoryEmbeddingStore`，不把缓存误当作知识数据持久化。
- 快照无法解析时保留为 `engineering_memory.json.corrupt-<timestamp>`，随后以空索引继续启动，避免坏文件阻塞桌面应用。
- 单次落盘失败只记录 warning，当前进程仍使用内存索引；这保证可用性，但不等于数据已经持久化成功。
- 当前没有宣称海量数据、跨进程并发锁、压缩/ compaction 或跨设备同步能力。

回滚到瞬态主索引时，可在受控启动环境设置 `APP_LOCAL_VECTOR_STORE_ENABLED=false` 并重启；不要直接删除用户目录中的快照。需要清理时先备份该目录，并把删除动作作为单独、明确授权的运维步骤。

## Beta.3 前必须补齐的验证

### 已完成的候选安装包 smoke（2026-08-27）

在临时 `--user-data-dir` 下从候选 `.app` 启动，使用 `curl --noproxy '*'` 直连 loopback，避免把 HTTP 代理误当作本机应用响应。探针命中 `http://127.0.0.1:18080/api/v1/system/health/ready`，返回 HTTP 200 和 `ready=true`；响应中 database、redis 均为 `ok=true`，model 为 `ok=false`（`localhost:1234` 未运行），但整体 readiness 仍为 true。运行日志同时确认 Java 21.0.10、H2/Flyway 13 migrations、Tomcat 18080、PgVector disabled，以及 `engineering_memory` 的 persistent desktop vector index 均正常启动。

这证明“候选 `.app` 能启动内置后端并正确降级”这一层；尚未证明签名/Gatekeeper、DMG/ZIP 下载回验或人工窗口交互，后续不能把它写成完整发布验收。

### 1. 修复本机 Electron CLI 环境

当前 `desktop/node_modules/.bin/electron --version` 在进入 Electron 前被 Homebrew Node 的 ABI 链阻断：`merve 1.2.2_1` 仍引用缺失的 `libsimdutf.34.dylib`，而当前 `simdutf 9.1.0` 提供 ABI 35。该动作会修改系统 Homebrew，需单独确认后执行；推荐顺序是 `brew upgrade merve`，只有升级不重链时才考虑针对同一包的 `brew reinstall merve`。禁止手工伪造 `.34 -> .35` 动态库软链接。

修复后的最小证据：

```bash
brew linkage --test merve
otool -L /opt/homebrew/opt/merve/lib/libmerve.1.2.2.dylib | rg libsimdutf
node --version
desktop/node_modules/.bin/electron --version
git status --short
```

### 2. 重跑候选安装包检查

在干净提交、Node 22（`22.12.x <= version < 23`）和稳定下载网络下执行：

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
./scripts/check-release-version.sh
cd desktop/src/renderer
npm run lint
npm test
npm run build
cd ../..
npm run test:main
npm run build
npm run test:packaged
```

`test:packaged` 只验证临时 `.app` 的 `app.asar`、`backend-jre/backend.jar` 和 bundled JRE 的物理布局；上面的 readiness smoke 已补上进程启动与后端健康检查，但仍不能替代人工窗口交互回归。

### 3. 完成真实 GUI smoke

从实际 `.app` 启动，记录以下原始证据：启动命令、应用 PID、动态 loopback 端口、readiness 响应、窗口可见性、退出码和日志路径。模型服务关闭时还要验证知识导入、浏览、标签、搜索、归档和复习仍可用；这条路径不得把 AI 错误误报为应用启动失败。

### 4. 采集真实搜索与安装包基准

候选数据集必须是可公开或用户明确授权的脱敏资料，固定提交、数据集版本和查询标注。每次采集都保存原始 JSON，不只保留汇总数字：

1. 先记录 Java、Node、macOS、机器架构、模型端点类型和 Git commit；冷启动与热启动分开测量。
2. 对固定查询集报告检索命中质量（至少 Recall@5、MRR）以及 p50/p95 延迟；排除首次模型下载、网络重试和人工操作时间，并记录排除原因。
3. 分别记录 DMG、ZIP、`.app`、`backend.jar`、bundled JRE 和 Renderer 产物大小；通过 `release-manifest.json` 与 `SHA256SUMS` 绑定到候选 commit。
4. 不预设“节省 Token”“15ms 响应”或固定安装包大小目标；先得到可复跑的第一份基线，再讨论阈值和回归门禁。

完成上述四项并在候选提交上复跑后，才具备创建新版本 tag、生成 Release 草稿和对外更新简历数字的条件。创建 tag、发布资产或修改版本号仍需要单独的发布授权。
