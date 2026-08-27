# AI Agent Knowledge Desk — 简历与面试作战手册

> 目标岗位：Java 后端、全栈开发、AI 应用工程。发布物和当前开发基线必须分开表述：`v0.1.0-beta.2` 是不可变发布证据；2026-08-27 的质量数据来自尚有未提交改动的本地工作区，提交并复跑前不归因给 Beta.2。

## 1. 简历可直接使用的版本

### 项目名称

**AI Agent Knowledge Desk｜Local-First 个人知识工作台**

### 技术栈

Java 21、Spring Boot 3.5、Spring Security、Spring Data JPA、Flyway、H2/PostgreSQL、Spring AI/LangChain4j、Electron、React、TypeScript、Vite、Caffeine、Docker、GitHub Actions

### 项目描述

独立设计并实现 Local-First 桌面知识工作台，支持网页/文件/片段采集、Inbox 整理、标签与搜索、每日复习、备份恢复和本机模型增强；Electron 安装包内置 Spring Boot 后端与 Java 运行时，普通知识管理无需额外安装 Java、数据库或 Docker。

### 项目亮点（推荐 4 条）

1. 设计 Electron + React + Spring Boot 的本地桌面架构，通过 `jlink` 内置 Java 21 运行时，并用 H2、Caffeine、内存向量库构建 Desktop Profile，完成可独立启动的 macOS arm64 Beta 交付。
2. 实现知识采集到再利用的完整链路：文件/网页/片段导入预检、去重与状态管理、标签和搜索、归档恢复、每日复习以及基于个人知识的 AI Assistant。
3. 加固 Electron 本地文件边界：将绝对路径与内容哈希限制在 Main Process，校验路径穿越、符号链接和文件稳定性，并通过 IPC 最小化向 Renderer 暴露的信息。
4. 修复多用户 RAG 与语义缓存隔离，将 `userId` 元数据过滤下推到向量检索请求；为后端建立 JaCoCo 行/分支双门禁（65%/60%）并接入 Maven `verify` 与 CI。2026-08-27 开发基线的后端为 341 项测试、行覆盖 75.4%、分支覆盖 61.8%；投递前应先提交并在目标提交复跑。

### 按岗位替换第 4 条（择一使用）

- **Java 后端岗：**建立后端 JaCoCo 行/分支双门禁（65%/60%），把覆盖率校验接入 Maven `verify` 与 CI；当前开发基线实测行 75.4%、分支 61.8%，并覆盖服务、配置、控制器与端到端错误路径。
- **全栈岗：**在 Electron Renderer、Main Process 与 Spring Boot 之间划分受控 IPC 边界，文件导入预检与业务 API 形成可追踪链路，并用桌面主进程与后端测试分别覆盖关键风险。
- **AI 应用岗：**将 `userId` 元数据过滤下推到 RAG 向量检索和语义缓存路径，避免跨用户候选集与缓存命中；模型不可用时保留知识管理基础流程。

上述精确覆盖率是 2026-08-27 的未发布本地基线，不应同时写成 `v0.1.0-beta.2` 的发布指标。

## 2. 30 秒项目介绍

> Knowledge Desk 是我独立完成的 Local-First 全栈 AI 桌面项目。它不是单纯聊天应用，而是把资料采集、Inbox 整理、标签搜索、每日复习和 AI 问答串成一个知识闭环。前端使用 Electron、React 和 TypeScript，后端使用 Java 21 与 Spring Boot；安装包内置 JRE 和 H2，基础知识管理不依赖 Java、Docker 或外部数据库。项目中我重点解决了本地文件安全边界、多用户 RAG 隔离和桌面独立发布问题。

## 3. 90 秒项目介绍

> 我做这个项目的原因是，普通收藏工具容易“只进不出”，聊天工具又缺少长期知识组织，所以我把产品主流程设计成采集、整理、检索、复习和再利用。
>
> 技术上，Renderer 使用 React 和 TypeScript，Electron Main Process 负责文件导入和进程管理，Spring Boot 负责鉴权、知识条目、标签、复习调度、模型源和 Assistant API。桌面 Profile 使用 H2、Caffeine 和内存向量库，并随安装包带一个 jlink 裁剪的 Java 21 运行时，因此用户不需要另外安装 Java、PostgreSQL 或 Docker。
>
> 我遇到的两个关键问题，一是 Renderer 不应该拿到用户绝对路径，所以我把预检、路径边界、符号链接和文件稳定性校验放在 Main Process；二是 RAG 不能在检索后才过滤用户数据，我把 userId 条件下推到 EmbeddingSearchRequest，并补了跨用户和无用户上下文测试。发布侧我固定了 Beta tag、manifest 与 SHA-256，使安装包可以追溯到提交；当前源码还把 JaCoCo 行/分支门禁接入 Maven `verify` 与 CI。这里要区分：Beta.2 证明发布资产，当前 341 项后端测试和 75.4%/61.8% 覆盖率是待提交开发基线。

## 4. 五个最值得展开的技术故事

### 故事 A：从“聊天应用”转向“知识闭环”

- 问题：早期功能容易围绕聊天和工具调用发散，产品主线不清楚。
- 判断：聊天只应是知识再利用入口，核心资产应是结构化、可找回的知识条目。
- 行动：重构信息架构为 Dashboard、Inbox、Library、Search、Detail、Review、Assistant、Settings；后端新增知识条目、来源资产、标签和复习状态模型。
- 结果：形成从输入到复习的完整产品闭环，面试时可以从用户价值而不是技术名词开始讲。

### 故事 B：让桌面包真正独立启动

- 问题：开发环境可运行不代表安装包可运行；曾出现 Bean 缺失、JRE 模块不完整、PgVector 驱动初始化失败。
- 根因：Desktop Profile 仍隐式依赖遗留服务，jlink 未包含 Spring 代理所需模块，向量存储没有真正降级。
- 修复：去除错误 Profile 限制；加入 `jdk.unsupported`；Desktop Profile 关闭 PgVector，使用 `InMemoryEmbeddingStore`；把后端 JAR 与 JRE 放入 Electron resources。
- 验证：从打包产物独立启动，轮询 readiness，并验证不依赖外部 Java、PostgreSQL 或 Docker。

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

后端包含 Service、Controller、配置、数据迁移、集成与端到端流程测试；Electron Main 测试 IPC、路径、导入、启动和打包保护；Renderer 有 API 契约与 ViewModel 测试；Local Service 有路径与鉴权测试。当前后端开发基线（2026-08-27）通过 `mvn --settings .mvn/settings.xml -pl backend -am clean verify`：`backend` 341 项测试、0 failure、0 error、14 skipped，JaCoCo 行 75.4%、分支 61.8%，并实际满足行 ≥65%、分支 ≥60% 门禁。Electron、Renderer 与 Local Service 的 25/33/10 是 2026-08-20 的独立历史验证记录；不把这些不同日期、不同源代码边界的数据合成一个“全项目测试数”，也不把当前后端指标归因给 Beta.2。

### Q12：为什么测试日志里模型调用失败仍可能整体通过？

部分集成测试验证的是降级和错误路径，会用 mock endpoint 主动触发不完整响应。是否通过应以 Surefire 结果和断言为准，而不是看到 ERROR 日志就判断失败；但生产日志仍应控制噪声并区分预期异常。

### Q13：如何处理数据迁移？

使用 Flyway 管理数据库版本；PostgreSQL 与 H2 的方言差异通过各自迁移路径处理。测试会从空库执行迁移，避免只验证已有开发数据库。

### Q14：项目最大的技术债是什么？

一是仓库仍保留早期 Dev Coach 和微服务实验模块，产品叙事与依赖面偏大；二是当前桌面向量库为内存实现，重启后的语义索引持久化与大数据规模仍需演进；三是安装包同时包含 Electron、JRE 和辅助运行时，体积仍需专项优化。

### Q15：下一步你会怎么做？

优先做三件事：将 Desktop 的向量索引替换为可持久化的本地实现；补充安装后自动化 E2E；建立真实数据集的搜索质量与安装包体积基准。之后再考虑多设备同步，而不是立即拆更多微服务。

## 6. 深挖追问的回答结构

遇到任何技术追问，都按下面顺序回答：

1. 先说具体问题，不先堆技术名词。
2. 解释根因或约束。
3. 说你的决策和为什么没有选其他方案。
4. 指出代码层落点或数据流。
5. 给测试、构建或发布证据。
6. 主动说明仍存在的边界。

示例：

> 打包应用曾经只能在开发机上运行。根因不是 Electron 本身，而是后端 Profile、jlink 模块和 PgVector 初始化仍带着开发环境假设。我分别修正 Bean 条件、加入 `jdk.unsupported` 并让 Desktop Profile 使用内存向量库。最后不是只看打包命令，而是从 `.app` 内置 JRE 启动后端并请求 readiness。代价是桌面语义索引目前不持久化，这是下一阶段要解决的点。

## 7. 不要在简历或面试中这样说

- 不说“零外部依赖”：AI 功能需要本机模型服务。
- 不说“已通过 Apple 公证”：Beta.2 是 ad-hoc 签名。
- 不说“企业级生产系统”：它是个人作品集 Beta，有生产化设计但没有真实生产流量证据。
- 不说“覆盖率很高”：准确说法是“后端 Maven `verify` 有行 ≥65%、分支 ≥60% 门禁；2026-08-27 本地开发基线为行 75.4%、分支 61.8%”，并说明它尚未对应已发布 tag。
- 不说“节省 80% Token”或“响应 15ms”：仓库没有本轮可复现基准证明这些数字。
- 不把可选 Kafka/Milvus/Kubernetes 说成桌面版运行必需。
- 不把早期 Computer Use 说成打包版能力：发布构建明确禁用它。
- 不把 341 个后端测试说成全系统测试；历史 225 个测试也不能与当前 341 个相加，更不能在没有对应验证记录时归因给 Beta.2。

## 8. 面试官可能指出的不足

### “安装包 400MB 以上，太大了”

承认 Electron + JRE 的体积成本。当前 Beta 优先验证独立运行；后续可以分析 ASAR、依赖和 JRE 模块占比，减少 CLI/开发资源，或评估 Tauri/原生壳，但不能为了体积牺牲 Java 后端作品展示目标。

### “InMemory Embedding Store 重启就没了”

这是当前桌面 Beta 的明确限制。结构化知识仍保存在 H2，向量能力可以重建；下一步应采用本地持久化向量索引并设计增量重建，而不是让用户依赖 PostgreSQL。

### “为什么仓库这么大、模块这么多？”

项目经历过从 Agent/Dev Coach 到 Knowledge Desk 的收敛，保留了扩展模块。主产品边界现在已经明确，但仓库瘦身仍是技术债。回答时把“历史原因、当前主线、下一步拆分/归档计划”讲清楚。

### “你怎么证明安装包对应这份代码？”

通过固定 tag 和 commit、release manifest、资产 SHA-256，以及从 GitHub 重新下载后校验。Beta.2 对应提交 `fd5f26d...`，而不是用本地某个未提交目录当发布证据。

## 9. 面试前准备清单

- 能在白板上画出 [`PROJECT_SHOWCASE.md`](PROJECT_SHOWCASE.md) 的产品闭环和运行时架构。
- 记住四个事实：Java 21、Desktop Profile、当前后端 JaCoCo 门禁（行 65%/分支 60%）、Beta.2 ad-hoc signed。
- 准备一个“模型可用”和一个“模型不可用”的演示路径。
- 能解释 H2 与 PostgreSQL、单体与微服务、Electron 与纯 Web 的取舍。
- 能打开 GitHub Release、manifest 和 SHA256SUMS 作为证据。
- 不背整段答案；每个故事只记“问题—根因—选择—验证—边界”。

完整演示流程见 [`docs/portfolio/DEMO_SCRIPT.md`](docs/portfolio/DEMO_SCRIPT.md)，证据清单见 [`docs/portfolio/EVIDENCE.md`](docs/portfolio/EVIDENCE.md)。
