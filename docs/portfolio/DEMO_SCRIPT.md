# Knowledge Desk 面试演示脚本

## 演示目标

让面试官在 5 分钟内看到三件事：产品闭环真实可用、前后端与本地运行时确实连通、你能说清工程取舍和边界。

## 5 分钟版本

### 0:00—0:30 定位

说：

> 这是一个 Local-First 的个人知识工作台，核心不是聊天，而是把资料采集、整理、检索、复习和 AI 再利用串成闭环。桌面包内置**受管后端运行时**：默认是 Spring Boot + H2 + jlink JRE，另有一条可显式切换的 FastAPI + SQLite 基线，两条实现同一个 `/api/v1` 契约，切换后端实现不需要改前端业务代码。

展示：Dashboard 首页和左侧完整导航。

### 0:30—1:40 采集与 Inbox

1. 拖入一个准备好的 Markdown 或 PDF 文件。
2. 展示预检、候选文件名和导入状态。
3. 说明绝对路径与内容哈希不会进入 Renderer。
4. 在 Inbox 中展示 pending/processing/ready/failed 状态与重试入口。

不要临场导入超大文件，也不要选择含隐私信息的真实资料。

### 1:40—2:40 Library、Search 与 Detail

1. 从 Library 使用标签或状态筛选。
2. 使用全局搜索查找刚才的内容。
3. 打开 Detail，展示来源、正文、摘要、标签和归档操作。

说：

> 结构化知识保存在本机（默认 Java 基线为 H2，Python 基线为 SQLite）；AI 不可用时，这条基础链路仍能工作。

### 2:40—3:30 Review

1. 打开每日复习队列。
2. 展示答案前后状态。
3. 提交一次反馈，说明反馈会更新下次复习时间。

只说“基于反馈更新调度”，除非能指向具体算法实现，不主动把它包装成完整 SM-2。

### 3:30—4:20 AI Assistant

前提：已配置一个演示专用模型源，并已在 Settings 中通过连接测试。推荐用**智谱 GLM-4-Flash**（免费额度，OpenAI-compatible，`baseUrl=https://open.bigmodel.cn/api/paas/v4`）—— 该端点已完成真实联调（19 项检查，2026-09-15）。

1. 打开模型设置，展示模型来源类型、脱敏端点和连接测试结果，不展示任何真实密钥。
2. 展示一次实际可用的 AI 知识整理操作：导入一段中文资料 → 整理 → 展示生成的摘要与标签。
3. 说明模型不可用不会阻断基础知识管理，并可现场停用模型源再整理一次，对比「本地启发式」结果（不产标签）。

若被追问「怎么证明真的调用了模型」，指向 ingestion job 的记录字段：真实模型为 `note=model`，本地启发式为 `note=local_heuristic`；同一段内容两次整理的摘要与标签互不相同（确定性启发式做不到）。

如果模型响应超过 15 秒，立即切到下方的无模型兜底，不要让面试官等待。

### 4:20—5:00 工程证据

1. 打开 GitHub `v0.1.0-beta.4` Release（历史发布资产）。
2. 展示 macOS arm64 的 DMG、ZIP 和 SHA256SUMS。
3. 说清楚这是 **ad-hoc 签名的个人演示版本**，不做 Apple 公证 —— 这是个人简历项目「能演示即可」的范围选择，不是未完成项。
4. 发布物说明版本、平台、签名和可追溯资产；`release-manifest.json` 绑定了构建提交。
5. 如面试官追问验证深度，按下面三条给证据（都可现场复现）：
   - **自动化测试**：Java 后端 387 项 + JaCoCo 双门禁（行 77.69% / 分支 64.26%）；Python 基线 173 项 pytest（覆盖率 91%）、渲染层 36 项、Electron 主进程 44 项 —— 后三条均已接入 CI，`python-backend-test` 与 `desktop-test`（含渲染层步骤）都已在本仓库 GitHub Actions 上通过。
   - **端到端数据闭环**：`scripts/desktop-closed-loop-demo.sh` —— 使用打包产物内**同一个**后端二进制 + 隔离数据目录，两阶段跑通「导入 → 整理 → 搜索 → 复习 → 重启后仍存在」共 17 项检查。
   - **真实模型联调**：`scripts/desktop-model-integration.sh` —— 19 项检查，覆盖真实整理（`note=model`）、本地启发式对照、失败降级与凭据加密。

只跑 `scripts/desktop-closed-loop-demo.sh`（约 10 秒）就能证明产品闭环成立，不依赖现场手动点界面。

## 10 分钟版本增加内容

在 5 分钟脚本基础上增加：

- 画出 Electron Renderer → IPC → Main → 运行时选择器 →（Spring Boot + H2 ／ FastAPI + SQLite）的架构图。
- 展开一次文件导入安全链路：路径边界、符号链接、稳定性、批量原子预检。
- 展开一次桌面启动链路：bundled JRE、动态 loopback 端口、readiness。
- 展示一条 RAG 用户隔离测试或相关服务代码。
- 现场运行一个小型测试命令，而不是全量打包。

推荐现场命令：

```bash
cd desktop
npm run test:main
```

或：

```bash
mvn --settings .mvn/settings.xml \
  -pl backend -am \
  -Dtest=RAGMemoryServiceTest,SemanticCacheServiceTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

## 模型不可用时的兜底脚本

说：

> AI 是增强能力，不是启动依赖。现在演示模型源未配置、未连接或连接失败；我用这个状态展示产品的降级边界：导入、Library、搜索、Detail 和 Review 仍可用；Settings 会明确提示模型连接失败，而不是让整个应用打不开。

然后继续展示基础知识链路，并打开已准备好的架构图说明 Assistant 的正常数据流。不要伪造在线回答。

## 应用启动失败时的兜底脚本

1. 不在现场修改数据库或重装依赖。
2. 打开发布页与架构材料。
3. 展示录制好的 60—90 秒无剪辑操作视频（需要提前准备）。
4. 展示本轮测试证据与 release manifest。
5. 面试后再发送修复说明，不把截图说成实时运行。

## 演示数据准备

准备 5—8 条无隐私知识：

- 一篇 Spring Boot 事务笔记
- 一篇 RAG 用户隔离笔记
- 一篇 Electron IPC 安全笔记
- 一个 PDF 或 DOCX 示例
- 一个重复文件，用于展示去重
- 一个可复习条目

保证标题和标签易读，避免使用“测试 1”“abc”这类演示数据。

## 演示前 15 分钟检查

- 应用从本机 `desktop/release/python-arm64/mac-arm64/AI Agent.app` 直接启动成功（**ad-hoc 签名，无需 Apple 开发者账号**）。**建议用自己的笔记本演示**：本机 Gatekeeper 评估为 `assessments disabled`，换一台机器可能被拦截。
- 若必须在他人机器上运行，提前准备放行步骤（「系统设置 → 隐私与安全性」中确认信任），或直接改用录屏兜底。
- readiness 可访问，端口没有被旧进程占用。
- 演示账户和知识数据已准备，且不含密钥、邮箱、真实路径或隐私文档。
- 演示模型源已配置并通过连接测试；如使用云端 API，网络、配额与演示专用 Key 已准备；如使用本机兼容模型，模型服务、模型 ID 与应用配置一致。
- 网络断开时的基础流程已确认。
- GitHub Release 页面已预先打开。
- 系统通知、聊天软件和密码管理器弹窗已关闭。
- 终端字体和应用缩放适合屏幕共享。
- 录屏兜底可离线播放。

## 面试演示禁区

- 不现场执行全量 `npm install`、完整打包或 Docker 镜像构建。
- 不展示环境变量、API Key、数据库文件或用户绝对路径。
- 不临时开启打包版已禁用的 Computer Use。
- 不把 mock 响应说成真实模型结果。
- 不声称已完成 Apple 公证或 Developer ID 签名：当前为 ad-hoc 签名的个人演示版本。
- 不引用已失效的隔离脚本：`scripts/beta4-isolated-smoke.sh` 依赖的 `--user-data-dir` 已被当前 Electron 版本拒绝，隔离验证请改用 `scripts/desktop-closed-loop-demo.sh`。
- 不因一次模型失败就切到无关的微服务或 Kubernetes 展示。
