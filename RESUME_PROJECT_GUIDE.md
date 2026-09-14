# AI Agent Knowledge Desk — 简历与面试作战手册

> **核心导航**：
> - 📄 **简历开箱即用模板**：[`docs/portfolio/RESUME_TEMPLATES.md`](docs/portfolio/RESUME_TEMPLATES.md)（含 Java+AI 复合岗、高并发 Java 后端岗、AI Agent 岗三套大厂 STAR 模板）
> - 🎯 **16 道顶级大厂连环深挖底稿**：[`docs/portfolio/INTERVIEW_DRILLS.md`](docs/portfolio/INTERVIEW_DRILLS.md)（涵盖 Milvus、Kafka、双写一致性、RRF 算法、语义缓存等）
> - 📊 **量化性能与 RAG 评测报告**：[`docs/portfolio/BENCHMARK_REPORT.md`](docs/portfolio/BENCHMARK_REPORT.md)（含 Hit@3 92.3% 自动化基准、大模型语义缓存与多级缓存架构设计）
>
> 目标岗位：Java + AI 复合双修、Java 高并发后端、AI Agent 应用工程。当前后端 387 项自动化测试全绿（373 项通过、14 项跳过、0 失败、0 错误），且通过 JaCoCo 行 ≥65%（实测 77.69%）、分支 ≥60%（实测 64.26%）双重强门禁；该基线绑定已发布的 `v0.1.0-beta.4`（`main@09d3cb0`）。

> **新增的 Python 后端基线**（FastAPI + SQLite + Alembic，`main@1ed2b69`，2026-09-12 本机复跑）：Python 后端 **173 项 pytest 通过**、渲染层 **36 项**、Electron 主进程 **44 项**测试通过，arm64 打包运行时验收 **9 项全部 PASS**。这是**工程完成度**，不是发布结论：未签名/公证、未构建 x64、未做真实模型调用、未完成完整人工 GUI 数据流程回归。

## 1. 简历可直接使用的版本

### 项目名称

**AI Agent Knowledge Desk｜企业级 RAG 与 Local-First 智能知识工作台**

### 技术栈

Java 21、Spring Boot 3.5、LangChain4j、Spring AI、Milvus、Kafka、Redis、PostgreSQL (pgvector)、Caffeine、MyBatis-Plus、Flyway、Docker、Electron、React、TypeScript、JaCoCo、**Python 3.12、FastAPI、SQLAlchemy 2、Alembic、SQLite、PyInstaller、uv、pytest**

### 项目描述

独立设计并实现支持多端自适应的 AI 智能知识工作台。具备从网页/文档采集、异步分块切片、高维向量存储到智能 RAG 检索、间隔复习与 Agent 问答全链路闭环；架构上兼顾“生产集群态（Milvus + Kafka + Redis）”与“桌面极简零依赖态（H2 + 本地 JSON 向量快照）”；后端在 `/api/v1` 契约冻结的前提下，支持 Java（Spring Boot + H2）与 Python（FastAPI + SQLite）两条**可显式切换**的本地基线。

### 项目亮点（推荐 5 条，第 6 条为全栈/双栈岗备选）

1. **三级弹性向量存储体系**：基于 LangChain4j 统一向量 Provider，启动期探测并支持生产态连接 Milvus 分布式向量库、过渡态连接 PgVector，并在单机桌面态自动优雅降级至具备 JSON 持久化快照与损坏自愈的本地向量索引，提升单机与轻量场景下的启动弹性与容错能力。
2. **基于 Kafka 落地异步切片与文档向量化削峰事件流**：设计 `KnowledgeIngestionProducer`（同步等待 Broker ACK 确认与 2s 超时降级）与消费者解耦文档导入后的切片与向量入库；消费者端配置 Spring Kafka `DefaultErrorHandler` + `DeadLetterPublishingRecoverer` 实现指数退避重试与死信队列（DLT）路由闭环；建立基于 SHA-256 摘要与进程内条带互斥锁（Striped Lock）的双重检查防重机制，消除锁分裂竞态并抑制本地异步降级与 Consumer 重试时的重复切片写入。
3. **RRF 混合检索与用户级 Pre-filtering 下推**：结合全文检索（BM25/FTS）与密集向量检索，在包含 8 篇典型技术文档与 13 组对比查询的模拟评测集上，验证 RRF（\(k=60\)）排名融合有效平衡了专有名词与语义排序，模拟 Top-3 召回率达 **92.3%**；检索请求强制将 `userId` 下推到底层向量引擎，实现租户级数据逻辑隔离与跨租户防穿透。
4. **大模型语义缓存与多级防击穿拓扑**：针对高频重复相似问答，设计基于高维向量余弦相似度（阈值 ≥0.92）的语义缓存拦截层，命中相似查询直接复用历史响应，显著削减 LLM API 调用开销与排队延迟；针对元数据设计 Caffeine L1 + Redis L2 两级缓存拓扑，从架构上落地互斥锁防击穿、随机 TTL 抖动防雪崩、空值缓存防穿透，并结合 Cache-Aside 双写淘汰保障最终一致性。
5. **严苛的双门禁质量工程**：全系统建立 387 项自动化测试（373 项通过、14 项跳过、0 失败、0 错误），配置 JaCoCo 行（实测 77.69% ≥65%）与分支（实测 64.26% ≥60%）双重强门禁并接入 Maven `verify` 与 CI/CD Pipeline，为架构重构与故障降级路径建立稳固的自动化回归防护。

6. **契约冻结下的后端实现可替换性（全栈 / 双栈岗建议补上）**：在保持 `/api/v1` 契约不变的前提下，新增一条与 Spring Boot 并排的 FastAPI + SQLite 后端基线，由显式运行时选择器（`backend-runtime.json`，开发期可由环境变量覆盖）决定启动哪一条，并**刻意不做隐式回退**——选中基线缺少产物时直接失败并输出缺失清单，避免静默切换在 H2 与 SQLite 之间改变数据路径。前端零改动即可切换后端实现，契约一致性由路由清单与字段命名测试门禁守住（Python 后端 173 项 pytest，含契约回归测试）。

### 按岗位替换第 4 条（择一使用）

- **Java 后端岗：**建立后端 JaCoCo 行/分支双门禁（65%/60%），把覆盖率校验接入 Maven `verify` 与 CI；当前发布基线（`v0.1.0-beta.4`）实测行 77.69%、分支 64.26%，并覆盖服务、配置、控制器与端到端错误路径。
- **全栈岗：**在 Electron Renderer、Main Process 与 Spring Boot 之间划分受控 IPC 边界，文件导入预检与业务 API 形成可追踪链路，并用桌面主进程与后端测试分别覆盖关键风险。
- **AI 应用岗：**将 `userId` 元数据过滤下推到 RAG 向量检索和语义缓存路径，避免跨用户候选集与缓存命中；模型不可用时保留知识管理基础流程。

上述精确覆盖率即已发布 `v0.1.0-beta.4`（`main@09d3cb0`）的验证基线；引用历史 Beta.2/Beta.3 资产时不得套用该数字。

## 2. 30 秒项目介绍

> Knowledge Desk 是我独立完成的 Local-First 全栈 AI 桌面项目。它不是单纯聊天应用，而是把资料采集、Inbox 整理、标签搜索、每日复习和 AI 问答串成一个知识闭环。前端使用 Electron、React 和 TypeScript，后端使用 Java 21 与 Spring Boot；安装包内置 JRE 和 H2，基础知识管理不依赖 Java、Docker 或外部数据库。后端我还做成了**契约冻结的可替换双基线**：在不改 `/api/v1` 契约、不改一行前端业务代码的前提下，新增了一条 FastAPI + SQLite 的 Python 本地后端，由显式运行时选择器决定启动哪一条。项目中我重点解决了本地文件安全边界、多用户 RAG 隔离、桌面独立发布和后端可替换性四个问题。

## 3. 90 秒项目介绍

> 我做这个项目的原因是，普通收藏工具容易“只进不出”，聊天工具又缺少长期知识组织，所以我把产品主流程设计成采集、整理、检索、复习和再利用。
>
> 技术上，Renderer 使用 React 和 TypeScript，Electron Main Process 负责文件导入和进程管理，Spring Boot 负责鉴权、知识条目、标签、复习调度、模型源和 Assistant API。桌面 Profile 使用 H2、Caffeine 和带 JSON 快照的本地向量索引，并随安装包带一个 jlink 裁剪的 Java 21 运行时，因此用户不需要另外安装 Java、PostgreSQL 或 Docker。
>
> 我遇到的三个关键问题，一是 Renderer 不应该拿到用户绝对路径，所以我把预检、路径边界、符号链接和文件稳定性校验放在 Main Process；二是 RAG 不能在检索后才过滤用户数据，我把 userId 条件下推到 EmbeddingSearchRequest，并补了跨用户和无用户上下文测试；三是桌面 PgVector 不应成为启动前置条件，因此我为主知识索引加入本地 JSON 快照、损坏隔离和落盘失败继续内存工作的持久化边界。发布侧我固定了 Beta tag、manifest 与 SHA-256，使安装包可以追溯到提交；当前源码还把 JaCoCo 行/分支门禁接入 Maven `verify` 与 CI。这里要区分：Beta.2/Beta.3 是历史发布资产，`v0.1.0-beta.4`（`main@09d3cb0`）的 387 项后端测试和 77.69%/64.26% 覆盖率是当前发布基线。
>
> 后端可替换性是我后来加的一条线：在不动 `/api/v1` 契约的前提下，我并排做了一条 FastAPI + SQLite 的 Python 本地后端，桌面包可以同时携带两条基线，用 `backend-runtime.json` 显式选择启动哪一条。这里我刻意**不做隐式回退**——选中的基线缺产物就启动失败并报出缺失清单，因为静默换一条基线会在 H2 和 SQLite 之间悄悄改变数据路径。Python 基线本机 173 项 pytest 通过、arm64 打包运行时验收 9 项全过；但它目前只是本机 arm64 的工程完成度，尚未签名、未构建 x64、未做真实模型联调。

## 4. 六个最值得展开的技术故事

### 故事 A：从“聊天应用”转向“知识闭环”

- 问题：早期功能容易围绕聊天和工具调用发散，产品主线不清楚。
- 判断：聊天只应是知识再利用入口，核心资产应是结构化、可找回的知识条目。
- 行动：重构信息架构为 Dashboard、Inbox、Library、Search、Detail、Review、Assistant、Settings；后端新增知识条目、来源资产、标签和复习状态模型。
- 结果：形成从输入到复习的完整产品闭环，面试时可以从用户价值而不是技术名词开始讲。

### 故事 B：让桌面包真正独立启动

- 问题：开发环境可运行不代表安装包可运行；曾出现 Bean 缺失、JRE 模块不完整、PgVector 驱动初始化失败。
- 根因：Desktop Profile 仍隐式依赖遗留服务，jlink 未包含 Spring 代理所需模块，向量存储没有真正降级。
- 修复：去除错误 Profile 限制；加入 `jdk.unsupported`；Desktop Profile 关闭 PgVector，使用带 JSON 快照的本地向量索引；把后端 JAR 与 JRE 放入 Electron resources。
- 验证：从候选打包产物独立启动，轮询 readiness，并验证不依赖外部 Java、PostgreSQL 或 Docker；2026-09-09 在 `v0.1.0-beta.4` 候选 `.app` 上完成隔离 `--user-data-dir` 双启动 smoke（`scripts/beta4-isolated-smoke.sh`）：模型不可用时 `ready=true` 降级启动、H2 数据落盘、退出无后端进程残留、重启数据复用。人工窗口交互与签名分发仍保留为边界说明。

### 故事 C：多用户 RAG 隔离

- 问题：如果先取回全局向量候选再在业务层过滤，其他用户内容已经进入候选集，语义缓存也可能误命中。
- 修复：构造 `EmbeddingSearchRequest` 时加入 `MetadataFilterBuilder.metadataKey("userId").isEqualTo(...)`。
- 测试：覆盖当前用户、其他用户和缺少用户上下文三种情况。
- 取舍：过滤能力依赖具体向量存储实现，因此 Provider 与测试契约要保持一致。

### 故事 D：Electron 文件导入安全边界

- 问题：Renderer 属于相对不可信层，不应获得任意文件系统访问权或用户绝对路径。
- 修复：文件选择、路径规范化、符号链接检查、内容哈希和稳定性检查全部放在 Main Process；Renderer 只接收候选 ID、文件名和可展示状态。
- 防护：拒绝绝对路径、路径穿越、前缀碰撞和外部符号链接；批量导入保证预检原子性；错误返回移除路径。
- 验证：主进程与 Local Service 分别有针对性测试。

### 故事 E：发布不是“打包成功”

- 问题：上传一个 DMG 不能证明它来自当前代码，也不能证明下载后完整。
- 方案：固定版本和 Git commit，生成 DMG/ZIP、`release-manifest.json` 与 `SHA256SUMS`，上传后按 GitHub 实际资产名重建清单，再独立下载校验。
- 结果：`v0.1.0-beta.2` 是可追溯的 GitHub prerelease。
- 边界：个人 Beta 使用 ad-hoc 签名；没有声称 Developer ID 或 notarization 已完成。

### 故事 F：不改前端换后端——契约冻结与显式运行时选择

- 问题：桌面包把 Spring Boot + H2 与内嵌 JRE 绑成唯一后端，运行时体积与语言绑定性是实际成本；但直接重写后端会同时赌上既有功能与整个前端。
- 判断：可以替换的是**实现**，不能动的是**契约**。只要 `/api/v1` 的路径、方法、字段命名（camelCase）、状态码与 `{"message","code"}` 错误结构不变，前端就没有理由改。
- 行动：新增 `python-backend/`（FastAPI + SQLAlchemy 2 + Alembic + 本地 SQLite，Python 3.12 / uv 管理依赖），与既有 `backend/` 并排存在、不覆盖 Java 实现；桌面侧新增 `backend-runtime.ts`，按 `KD_BACKEND_RUNTIME`（仅开发期生效）→ `backend-runtime.json`（构建期写入、随包发布）→ 默认 `java` 的优先级解析运行时，并用 PyInstaller `onedir` 把 Python 运行时打进 `extraResources`。
- 关键取舍：**拒绝隐式回退**。选中基线缺产物时直接失败并列出缺失清单，因为静默切到另一条基线会在 H2 与 SQLite 之间改变数据路径，这比启动失败更难诊断。
- 验证：Python 后端 173 项 pytest（含 `test_contract.py` 的路由清单与字段命名门禁）、渲染层 36 项、Electron 主进程 44 项；arm64 打包产物 `AI Agent.app` 的运行时验收 9 项全部 PASS（含 readiness HTTP 200、在 dataDir 内创建 SQLite）。另有一处产品细节：渲染层可能先于后端就绪而加载，此时显示降级预览数据，后端进入 `running` 后自动重取快照切到真实数据。
- 边界：这是本机 arm64 的工程完成度，不是发布结论——未签名/公证、未构建 x64/universal、未做真实模型调用、未完成完整人工 GUI 数据流程回归。（CI 覆盖已于 2026-09-14 校准：`.github/workflows/ci.yml` 新增 `python-backend-test` job，以 Python 3.12 + uv 执行 `uv run pytest`。）

## 5. 高频面试问答

### Q1：为什么选择 Electron + Spring Boot，而不是纯 Web？

Electron 提供系统级文件选择、拖拽导入、安装包和本地进程生命周期；Spring Boot 承载我希望展示的 Java 后端分层、鉴权、事务和数据建模。代价是安装包更大、进程更多，因此桌面版采用单体后端和裁剪 JRE，避免把微服务复杂度带入个人客户端。

### Q2：Local-First 具体体现在哪里？

知识条目、标签和复习状态默认保存在本机 H2；缓存使用 Caffeine；桌面包内置后端和 JRE。基础知识管理不依赖云端。AI 功能仍需要用户配置本机 OpenAI-compatible 服务，所以不能笼统说“完全零依赖”。

### Q3：为什么桌面版用 H2，不直接用 PostgreSQL？

个人桌面应用更看重零配置和可携带性。H2 适合单用户本地数据，但并不适合多节点和高并发。仓库保留 PostgreSQL/pgvector 的服务端形态，二者通过 Profile 和 Flyway 迁移路径分离。

### Q4：如何保证前后端协议一致？

前端 API 层集中定义请求与响应解析，后端 Controller/DTO 作为服务端契约；针对列表、搜索、来源、复习、备份和批量导入都有前端契约测试，CI/发布脚本还执行一致性检查。后续更理想的演进是引入 OpenAPI 生成类型，减少手工同步。

### Q5：RAG 如何避免跨用户数据泄漏？

隔离条件必须进入向量检索请求，而不是只做结果后过滤。项目使用 `userId` 元数据过滤构造 `EmbeddingSearchRequest`，语义缓存查询同样要求用户上下文，并覆盖其他用户与无上下文测试。

### Q6：语义缓存有什么风险？

主要风险是跨用户命中、相似但语义不同的误命中和旧答案过期。项目已解决用户隔离；阈值、版本和失效策略仍需根据真实数据调优。因此面试时不宣称固定“节省 80% Token”或“15ms 响应”，除非补充可复现实验。

### Q7：如何处理模型不可用？

模型连接测试和 AI 请求错误会反馈到 UI，但知识导入、浏览、标签、搜索、归档和复习不应被模型状态阻塞。产品上把 AI 视为增强能力，而不是应用启动条件。

### Q8：为什么没有把所有模块都拆成微服务？

桌面产品的主要约束是可安装、可启动和易诊断，微服务会引入多个进程、端口和中间件。当前主路径采用模块化单体；仓库中的 Router/Retrieval/Generation/Reflection 模块作为扩展研究，不把它们包装成 Beta 运行时的必选架构。

### Q9：Electron 如何降低攻击面？

核心原则是 Renderer 不直接拥有 Node 和文件系统能力；只通过受控 IPC 调用 Main Process。主进程验证路径边界和符号链接，敏感路径不返回给 UI，审批请求不能重放，打包环境也不能通过环境变量重新打开遗留 Computer Use。

### Q10：备份是否会泄漏 API Key？

知识库备份只包含知识数据与复习状态，不包含模型源密钥。后端保存的 API Key 使用加密字段持久化，密钥从外部配置注入。面试时要区分“数据库字段加密”和“整库加密”，项目实现的是前者。

### Q11：测试覆盖了哪些层？

后端包含 Service、Controller、配置、数据迁移、集成与端到端流程测试；Electron Main 测试 IPC、路径、导入、启动和打包保护；Renderer 有 API 契约与 ViewModel 测试；Local Service 有路径与鉴权测试。当前发布基线通过 `mvn --settings .mvn/settings.xml -pl backend -am clean verify`：`backend` 387 项测试、0 failure、0 error、14 skipped，JaCoCo 行 77.69%、分支 64.26%，并实际满足行 ≥65%、分支 ≥60% 门禁，绑定已发布的 `v0.1.0-beta.4`（`main@09d3cb0`）；`bug-sentinel-starter` 另有 4 项测试通过。Electron、Renderer 与 Local Service 的 25/33/10 是 2026-08-20 的独立历史验证记录；不把这些不同日期、不同源代码边界的数据合成一个“全项目测试数”。新增的 Python 后端基线另有 173 项 pytest 通过；渲染层 36 项与 Electron 主进程 44 项是 2026-09-12 在 `main@1ed2b69` 上的复跑结果（与上一条 25/33/10 的历史记录分属不同日期与代码边界，同样不能相加）。

### Q12：为什么测试日志里模型调用失败仍可能整体通过？

部分集成测试验证的是降级和错误路径，会用 mock endpoint 主动触发不完整响应。是否通过应以 Surefire 结果和断言为准，而不是看到 ERROR 日志就判断失败；但生产日志仍应控制噪声并区分预期异常。

### Q13：如何处理数据迁移？

使用 Flyway 管理数据库版本；PostgreSQL 与 H2 的方言差异通过各自迁移路径处理。测试会从空库执行迁移，避免只验证已有开发数据库。

### Q14：项目最大的技术债是什么？

一是仓库仍保留早期 Dev Coach 和微服务实验模块，产品叙事与依赖面偏大；二是当前本地向量索引已经支持快照恢复，但还没有大数据规模、跨进程并发和真实语料搜索质量基准；三是安装包同时包含 Electron、JRE 和辅助运行时，体积仍需专项优化。

### Q15：下一步你会怎么做？

优先做三件事：修复本机 Electron 运行时后补充安装后自动化 E2E；按候选协议建立真实数据集的搜索质量、冷/热启动和安装包体积基准；再评估多设备同步，而不是立即拆更多微服务。

### Q16：为什么同时维护两条后端基线（Java 与 Python）？

这不是为了堆技术栈，而是让“后端实现”变成可替换项。前提是契约必须先冻结：两条基线实现同一 `/api/v1` 契约，路径、方法、camelCase 字段、状态码与错误结构一致，因此前端零改动就能切换。收益是我能在不触碰产品界面的前提下重新权衡本地运行时（体积、依赖面、语言栈）；风险相应转移到契约一致性上，所以我用路由清单与字段命名测试做门禁，并把三处与 Electron 主进程的隐式耦合（登录失败文案、邮箱重复包含 `already`、知识条目 id 为 36 位 UUID）固化进测试。边界同样要说清：Python 基线目前只是本机 arm64 的工程完成度，未签名、未构建 x64、未做真实模型联调，CI 也还没覆盖它；默认与可回退路径仍是 Java 基线。

## 6. 深挖追问的回答结构

遇到任何技术追问，都按下面顺序回答：

1. 先说具体问题，不先堆技术名词。
2. 解释根因或约束。
3. 说你的决策和为什么没有选其他方案。
4. 指出代码层落点或数据流。
5. 给测试、构建或发布证据。
6. 主动说明仍存在的边界。

示例：

> 打包应用曾经只能在开发机上运行。根因不是 Electron 本身，而是后端 Profile、jlink 模块和 PgVector 初始化仍带着开发环境假设。我分别修正 Bean 条件、加入 `jdk.unsupported`，让 Desktop Profile 在 PgVector 不可用时落到带 JSON 快照的本地向量索引。现有自动化覆盖资源布局与恢复边界；2026-09-09 已从 `v0.1.0-beta.4` 候选 `.app` 完成隔离双启动 smoke：内置 JRE 启动后端 readiness 返回 HTTP 200/`ready=true`，模型服务不可用未阻塞启动，且验证了退出清理与重启持久化。Gatekeeper 分发与大规模索引/跨进程并发基准仍未完成。

## 7. 不要在简历或面试中这样说

- 不说“零外部依赖”：AI 功能需要本机模型服务。
- 不说“已通过 Apple 公证”：当前 Beta 均为 ad-hoc 签名。
- 不说“企业级生产系统”：它是个人作品集 Beta，有生产化设计但没有真实生产流量证据。
- 不说“覆盖率很高”：准确说法是“后端 Maven `verify` 有行 ≥65%、分支 ≥60% 门禁；当前发布基线为行 77.69%、分支 64.26%，绑定 `v0.1.0-beta.4`（`main@09d3cb0`）”。
- 不说“实测 32,000 QPS”或“线上实测 64.8% Token 节省”：没有集群物理压测证据前，严禁在简历中写未经实测的 QPS 或节省数字；技术交流着重体现多级防线设计（防穿透/击穿/雪崩）、双写淘汰一致性与高维向量语义拦截原理。评测套件为 8 篇文档与 13 组测试查询，绝不拿模拟当生产实测。
- 不把可选 Kafka/Milvus/Kubernetes 说成桌面版运行必需。
- 不把早期 Computer Use 说成打包版能力：发布构建明确禁用它。
- 不把 387 个后端测试（14 skipped）说成全系统测试；历史测试数（225/344/357 等）也不能与当前 387 个相加，更不能在没有对应验证记录时归因给历史 Beta。
- 不把 Python 基线说成“已经替代 Java 基线”或“已发布”：它是可显式切换的第二条基线，默认与可回退路径仍是 Java（仓库提交的 `backend-runtime.json` 当前值为 `java`）。
- 不说“已完成签名/公证”或“已支持 x64”：Python 基线已实测的产物是本机 arm64 未签名目录包（`desktop/release/python-arm64/`），x64 与 universal 尚未构建。
- 不说“已完成完整 GUI 数据流程回归”：当前自动化覆盖到打包运行时验收与渲染层单测，人工端到端（导入 → 整理 → 搜索 → 复习 → 重启后仍存在）回归尚未做。
- 不把 Python 基线的 173 项 pytest 与 Java 基线的 387 项后端测试相加。CI 覆盖已于 2026-09-14 校准（新增 `python-backend-test` job，Python 3.12 + uv，`uv run pytest --cov=knowledge_desk`），但该 job 默认不在 branch ruleset 的 required checks 中，在被强制之前不要把它说成"合并门禁"。

## 8. 面试官可能指出的不足

### “安装包 400MB 以上，太大了”

承认 Electron + JRE 的体积成本。当前 Beta 优先验证独立运行；后续可以分析 ASAR、依赖和 JRE 模块占比，减少 CLI/开发资源，或评估 Tauri/原生壳，但不能为了体积牺牲 Java 后端作品展示目标。

### “本地向量索引能否跨重启恢复？”

主知识索引现在由 `PersistentInMemoryEmbeddingStore` 包装：结构化知识仍保存在 H2，向量条目同步写入 `${app.data-dir}/vector-store/engineering_memory.json`。恢复时读取完整快照；JSON 损坏会被改名为 `.corrupt-<timestamp>` 并以空索引继续启动；单次落盘失败不会阻塞当前进程的内存检索。语义缓存仍是瞬态缓存。大规模压测、跨进程锁和搜索质量基准仍未完成，因此不能把它描述成生产级向量数据库。

### “为什么仓库这么大、模块这么多？”

项目经历过从 Agent/Dev Coach 到 Knowledge Desk 的收敛，保留了扩展模块。主产品边界现在已经明确，但仓库瘦身仍是技术债。回答时把“历史原因、当前主线、下一步拆分/归档计划”讲清楚。

### “你怎么证明安装包对应这份代码？”

通过固定 tag 和 commit、release manifest、资产 SHA-256，以及从 GitHub 重新下载后校验。Beta.2 对应提交 `fd5f26d...`，而不是用本地某个未提交目录当发布证据。

## 9. 面试前准备清单

- 能在白板上画出 [`PROJECT_SHOWCASE.md`](PROJECT_SHOWCASE.md) 的产品闭环和运行时架构。
- 记住四个事实：Java 21、Desktop Profile、本地向量快照恢复、后端 JaCoCo 门禁（行 65%/分支 60%，发布基线实测 77.69%/64.26%）；已发布 Beta 均为 ad-hoc signed。
- 准备一个“模型可用”和一个“模型不可用”的演示路径。
- 能解释 H2 与 PostgreSQL、单体与微服务、Electron 与纯 Web 的取舍。
- 能讲清双后端基线：契约冻结是前提（`/api/v1` 不变则前端零改动）、拒绝隐式回退的理由（静默切换会改变 H2 ↔ SQLite 数据路径）、以及验证口径（Python 173 / 渲染层 36 / 主进程 44，arm64 打包运行时验收 9 项 PASS）。
- 记住 Python 基线的边界一句话：本机 arm64、未签名/未公证、未构建 x64、未做真实模型联调、未完成完整人工 GUI 回归。
- 能打开 GitHub Release、manifest 和 SHA256SUMS 作为证据。
- 不背整段答案；每个故事只记“问题—根因—选择—验证—边界”。

完整演示流程见 [`docs/portfolio/DEMO_SCRIPT.md`](docs/portfolio/DEMO_SCRIPT.md)，证据清单见 [`docs/portfolio/EVIDENCE.md`](docs/portfolio/EVIDENCE.md)。
