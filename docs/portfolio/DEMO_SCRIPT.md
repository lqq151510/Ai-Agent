# Knowledge Desk 面试演示脚本

## 演示目标

让面试官在 5 分钟内看到三件事：产品闭环真实可用、前后端与本地运行时确实连通、你能说清工程取舍和边界。

## 5 分钟版本

### 0:00—0:30 定位

说：

> 这是一个 Local-First 的个人知识工作台，核心不是聊天，而是把资料采集、整理、检索、复习和 AI 再利用串成闭环。桌面包内置 Spring Boot 后端和 Java 运行时。

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

> 结构化知识保存在本机 H2；AI 不可用时，这条基础链路仍能工作。

### 2:40—3:30 Review

1. 打开每日复习队列。
2. 展示答案前后状态。
3. 提交一次反馈，说明反馈会更新下次复习时间。

只说“基于反馈更新调度”，除非能指向具体算法实现，不主动把它包装成完整 SM-2。

### 3:30—4:20 AI Assistant

前提：本机模型已启动并通过 Settings 的连接测试。

1. 打开模型设置，展示 loopback 地址和连接测试结果，不展示任何真实密钥。
2. 在 Assistant 中提出一个能命中演示知识的问题。
3. 解释 userId 元数据过滤在向量检索请求中执行。

如果模型响应超过 15 秒，立即切到下方的无模型兜底，不要让面试官等待。

### 4:20—5:00 工程证据

1. 打开 GitHub `v0.1.0-beta.2` Release。
2. 展示 DMG、ZIP、manifest 和 SHA256SUMS。
3. 说清楚这是 ad-hoc signed 的个人 Beta，不是 Apple 公证发行版。
4. 发布物只说明版本、平台、签名和可追溯资产；不要把它和没有绑定该 tag 的测试数字混说。
5. 如需展示当前源码质量，打开 `EVIDENCE.md` 并说明来源边界：2026-08-27 已推送的 `main@344b740` 基线中，`backend` 为 344 项测试、JaCoCo 行 76.39%/分支 62.87%，Maven `verify` 门禁为行 65%/分支 60%。候选 `.app` 的后端 readiness smoke 另有 HTTP 200/`ready=true` 证据，但没有对应新 tag 或 Release，不能称为 Beta.2 或下一 Beta 的发布结果。

## 10 分钟版本增加内容

在 5 分钟脚本基础上增加：

- 画出 Electron Renderer → IPC → Main → Spring Boot → H2 的架构图。
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

> AI 是增强能力，不是启动依赖。现在本机模型没有启动，我用这个状态展示产品的降级边界：导入、Library、搜索、Detail 和 Review 仍可用；Settings 会明确提示模型连接失败，而不是让整个应用打不开。

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

- 应用从发布构建启动成功。
- readiness 可访问，端口没有被旧进程占用。
- 演示账户和知识数据已准备，且不含密钥、邮箱、真实路径或隐私文档。
- 本机模型已加载，模型 ID 与应用配置一致。
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
- 不因一次模型失败就切到无关的微服务或 Kubernetes 展示。
