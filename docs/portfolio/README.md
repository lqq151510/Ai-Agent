# Knowledge Desk 简历项目材料索引

这套材料按“先讲产品，再讲架构，最后给证据”的顺序使用。

1. [`PROJECT_SHOWCASE.md`](../../PROJECT_SHOWCASE.md)：产品闭环、运行时架构、分层架构和三条核心链路图。
2. [`RESUME_PROJECT_GUIDE.md`](../../RESUME_PROJECT_GUIDE.md)：简历描述、30/90 秒介绍、技术故事、高频问答与避坑表达。
3. [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)：5 分钟与 10 分钟现场演示脚本、失败兜底和演示前检查。
4. [`EVIDENCE.md`](EVIDENCE.md)：测试、覆盖率、版本、发布资产和复现命令。
5. [`NEXT_BETA_CANDIDATE.md`](NEXT_BETA_CANDIDATE.md)：当前主线候选的已验证范围、安装包阻塞、向量索引恢复边界，以及待采集的真实基准协议。

推荐使用方式：

- 投递简历：使用面试手册中的“项目描述 + 4 条亮点”。
- 一面开场：使用 30 秒介绍，随后画产品闭环图。
- 技术深挖：从五个技术故事中选择与岗位最相关的两个。
- 项目演示：严格按 Demo Script，先演基础知识闭环，再演 AI 增强。
- 质疑核验：打开 Evidence 和 GitHub Release，不用口头夸大。

## 统一口径

- 主产品：个人使用的 Local-First Knowledge Desk 桌面应用。
- 主运行时：Electron + React + Spring Boot + H2 + bundled Java 21。
- AI 前置：用户自备本机 OpenAI-compatible 模型服务。
- 发布状态：`v0.1.0-beta.2` GitHub prerelease，macOS arm64，ad-hoc signed。
- 证据边界：Release 只证明 tag 与安装包；测试、覆盖率必须连同执行日期、命令和源代码边界引用，不能把已推送但未打 tag 的主线候选写成 Beta.2 或下一 Beta 的结果。
- 产品边界：个人作品集 Beta，不宣称已完成企业生产验证。
