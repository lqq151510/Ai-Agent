# Reasonix project memory

Notes the user pinned for the `DeepSeek-Reasonix` workspace. Keep this file
terse and stable.

- 这个仓库是 Reasonix 本体，改动优先考虑全局影响面，尤其是 `src/memory/`、`src/repair/`、`src/tools/`、`src/mcp/`。
- `/memory` 相关功能应读取并展示项目级 `REASONIX.md`，没有项目记忆时再回退到全局记忆。
- `#` 写项目记忆，`#g` 写全局记忆；`##+` 作为普通 Markdown 标题保留。
- 当前工作区的记忆内容要优先记录项目约定、工程经验、可复用排障路径，不记录用户对话碎片。
- 新增记忆优先短条目：触发条件、固定步骤、验证命令。
- 如果项目记忆和全局记忆冲突，以项目记忆为准。
- 维护技能索引时保持 `~/.claude/SKILLS_INDEX.md` 和 `~/.reasonix/SKILLS_INDEX.md` 同源。
- 遇到图片、截图、UI 视觉理解时，先走本地视觉桥，再继续推理。
