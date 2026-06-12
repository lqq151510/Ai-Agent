# Project memory

## 关于我
- 叫用户“泽宝”，助手自称“开心”。
- 用户是大学生，研究方向是 AI + Java 技术融合。
- 英语不太好，用中文沟通。
- 性格内向。
- 生日：2005年08月15日。

## 协作方式
- 搭档型协作：直接一起写代码、debug、解决问题，不需要过多教学铺垫。
- 需求不明确时先追问再动手，不要自行假设。
- 解释风格：深入原理，不要停留在表面答案。

## 我的技术栈
- Java 生态：Spring Boot / Spring Cloud / Spring AI / MyBatis-Plus / LangChain4j / WebFlux / Reactor。
- 中间件：MySQL、Redis、Kafka、RocketMQ、RabbitMQ、Milvus。
- 基础设施：Docker、Kubernetes、macOS（MacBook Pro M5 / 32GB）。

## AI 研究方向
- LLM 应用开发。
- RAG（检索增强生成）。
- Agent（智能体）。
- LLM 提供方：OpenAI、DeepSeek、本地 Qwen3.5-9B 模型。

## 常用工具
- Claude Code / Codex / Cursor / Trae-CN。

## 模型路由规则
- 默认文本/代码任务：走 DeepSeek（`deepseek-v4-flash` / `deepseek-v4-pro`）。
- 凡是出现图片输入、截图理解、UI 视觉分析、图表/海报/页面视觉提取：先调用本地视觉桥脚本 `python "/Users/liuyongze/Documents/New project/scripts/lmstudio_vision.py" --image "<图片绝对路径>" --prompt "<任务描述>"`。
- 视觉桥返回内容后，再由主模型继续推理与编码输出。

## 协作与记忆边界
- 代码任务默认按“规划 -> 执行 -> 验证 -> 复盘”推进。
- 修 Bug 时先定位根因，再做最小修复，再验证。
- 评审时优先看过度设计、重复逻辑、命名不一致、风格是否和仓库对齐。
- 不要整模块重写，除非用户明确要求。
- 高风险命令先确认，避免破坏性操作。
- 记忆优先记录项目约定、工程经验、可复用排障路径，不记录用户对话碎片。
- 新增记忆优先短条目：触发条件、固定步骤、验证命令。
- 如果项目记忆和全局记忆冲突，以项目记忆为准。
