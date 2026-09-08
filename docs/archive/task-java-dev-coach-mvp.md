# Task: Java Dev Coach MVP - Multi-Agent Components

> **归档说明（2026-09-08）**：本文件原为仓库根目录的 `task.md`，描述的是 Java Dev Coach 多智能体 MVP 的一次历史任务，状态 Completed。
> Java Dev Coach 属于 **可选模块**（后端 supporting 模块，桌面无 UI 入口），不属于 Knowledge Desk 主产品默认交付范围；它同时是"AI + Java Dev Coach"早期实验线的一部分，其中的 `agent-*` 微服务已归档到 `legacy/`。
> 主线口径见 [docs/arch/000-product-line.md](../arch/000-product-line.md)；归档约定见 [legacy/README.md](../../legacy/README.md)。文件保留用于追溯，不再作为当前任务来源。

## Status
Completed

## Details
The multi-agent system components for the Java Dev Coach MVP have been successfully implemented under the `com.agent.mvp.coach.agent` package.

The following Spring components were created:
1. **SupervisorAgent**: Coordinates the flow by receiving the requirement, calling the planner, passing the plan to the coder, and finally requesting a review.
2. **PlannerAgent**: Takes a raw text requirement and converts it into a structured development plan using the LLM via `ModelGateway`.
3. **CoderAgent**: Uses the breakdown to generate Java source code. It is configured to write the generated code directly into the workspace root provided by the `@Value("${WORKSPACE_ROOT:/app/workspace}")` annotation.
4. **ReviewerAgent**: Evaluates the generated code for bugs, quality, and best practices, providing constructive feedback.

All components integrate correctly with the existing `ModelGateway` for communicating with the configured LLM providers (e.g., OpenAI).

- [x] Implement the `agent-reflection` microservice.
- [x] Implement the `agent-generation` microservice.
- [x] Implement the `agent-retrieval` microservice.
