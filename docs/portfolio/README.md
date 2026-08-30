# Knowledge Desk 简历项目材料索引

这套材料按“先讲产品，再讲架构，最后给证据”的顺序使用。

1. [`PROJECT_SHOWCASE.md`](../../PROJECT_SHOWCASE.md)：产品闭环、运行时架构、分层架构和三条核心链路图。
2. [`RESUME_PROJECT_GUIDE.md`](../../RESUME_PROJECT_GUIDE.md)：简历描述、30/90 秒介绍、技术故事、高频问答与避坑表达。
3. [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)：5 分钟与 10 分钟现场演示脚本、失败兜底和演示前检查。
4. [`EVIDENCE.md`](EVIDENCE.md)：测试、覆盖率、版本、发布资产和复现命令。
5. [`NEXT_BETA_CANDIDATE.md`](NEXT_BETA_CANDIDATE.md)：Beta.3 的发布事实、历史验证边界、当前 CI/版本门禁问题与后续收口项。

推荐使用方式：

- 投递简历：使用面试手册中的“项目描述 + 4 条亮点”。
- 一面开场：使用 30 秒介绍，随后画产品闭环图。
- 技术深挖：从五个技术故事中选择与岗位最相关的两个。
- 项目演示：严格按 Demo Script，先演基础知识闭环，再演 AI 增强。
- 质疑核验：打开 Evidence 和 GitHub Release，不用口头夸大。

## 统一口径

- 主产品：个人使用的 Local-First Knowledge Desk 桌面应用。
- 主运行时：Electron + React + Spring Boot + H2 + bundled Java 21。
- AI 接入：用户可配置 DeepSeek 官方 API、OpenAI 官方 API 或 OpenAI-compatible 端点；未配置或不可连接模型时，普通知识管理仍可通过本地降级能力运行。
- 发布状态：`v0.1.0-beta.3` GitHub prerelease，macOS arm64；Release 说明声明为 ad-hoc signed，未公证。当前提交的主 CI 未通过，详见 `EVIDENCE.md`。
- 证据边界：Release 只证明 tag 与公开资产；Release 存在不等于 CI、完整 GUI 回归、下载校验或 Apple 公证已通过。测试和覆盖率必须带执行日期、命令和源码边界；历史 `main@344b740` 质量快照不得归因给 Beta.3。
- 产品边界：个人作品集 Beta，不宣称已完成企业生产验证。
