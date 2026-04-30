# QA Agent 设计指南

构建 Harness 时包含 QA Agent 的参考指南。基于实际项目（SatangSlide）中发现的 Bug 模式及其根因分析，提供 QA 易遗漏缺陷的系统性验证方法论。

---

## 目录

1. QA Agent 遗漏缺陷的模式
2. 集成一致性验证（Integration Coherence Verification）
3. QA Agent 设计原则
4. 验证检查清单模板
5. QA Agent 定义模板

---

## 1. QA Agent 遗漏缺陷的模式

### 1-1. 边界不一致（Boundary Mismatch）

最高频缺陷。两个组件各自"正确"实现，但连接点处契约不符。

| 边界 | 不一致示例 | 遗漏原因 |
|--------|-----------|-----------|
| API 响应 → 前端 Hook | API 返回 `{ projects: [...] }`，Hook 期望 `SlideProject[]` | 各自单独验证正常，未交叉对比 |
| API 响应字段名 → 类型定义 | API 返回 `thumbnailUrl`(camelCase)，类型定义为 `thumbnail_url`(snake_case) | TypeScript 泛型强制转换，编译器无法捕获 |
| 文件路径 → 链接 href | 页面位于 `/dashboard/create`，链接指向 `/create` | 未交叉对比文件结构和 href |
| 状态转换图 → 实际 status 更新 | 图中定义 `generating_template → template_approved`，代码中缺少转换 | 仅确认图存在，未追踪所有更新代码 |
| API 端点 → 前端 Hook | API 存在但无对应 Hook（未被调用） | 未 1:1 映射 API 列表和 Hook 列表 |
| 即时响应 → 异步结果 | API 即时返回 `{ status }`，前端访问 `data.failedIndices` | 未区分同步/异步响应，仅确认类型 |

### 1-2. 为什么静态代码审查抓不到

- **TypeScript 泛型的局限**: `fetchJson<SlideProject[]>()` — 运行时响应为 `{ projects: [...] }` 也能通过编译
- **`npm run build` 通过 ≠ 正常运行**: 类型转换、`any`、泛型被使用则构建成功但运行时失败
- **存在性检查 vs 连接性检查的区别**: "API 存在吗？"与"API 的响应与调用方的期望一致吗？"是完全不同的验证

---

## 2. 集成一致性验证（Integration Coherence Verification）

QA Agent 必须包含的 **交叉对比验证** 领域。

### 2-1. API 响应 ↔ 前端 Hook 类型交叉验证

**方法**: 比较每个 API route 的 `NextResponse.json()` 调用处和对应 Hook 的 `fetchJson<T>` 类型参数。

```
验证步骤:
1. 从 API route 的 NextResponse.json() 传递对象提取 shape
2. 确认对应 Hook 中 fetchJson<T> 的 T 类型
3. 比较 shape 和 T 是否一致
4. 确认是否包装（API 返回 { data: [...] } 则 Hook 是否解 .data）
```

**特别注意的模式:**
- 分页 API: `{ items: [], total, page }` vs 前端期望数组
- snake_case DB 字段 → camelCase API 响应 → 前端类型定义间不一致
- 即时响应（202 Accepted）vs 最终结果的 shape 差异

### 2-2. 文件路径 ↔ 链接/路由路径映射

**方法**: 提取 `src/app/` 下 page 文件的 URL 路径，与代码中所有 `href`、`router.push()`、`redirect()` 值对照。

```
验证步骤:
1. 从 src/app/ 下 page.tsx 文件路径提取 URL 模式
   - (group) → URL 中移除
   - [param] → 动态段
2. 收集代码中所有 href=、router.push(、redirect( 值
3. 确认各链接与实际存在的 page 路径匹配
4. 注意 route group 内部页面的 URL 前缀（例: dashboard/ 下级）
```

### 2-3. 状态转换完整性追踪

**方法**: 从代码中提取所有 `status:` 更新，与状态转换图对照。

```
验证步骤:
1. 从状态转换图（STATE_TRANSITIONS）提取允许的转换列表
2. 搜索所有 API route 中 .update({ status: "..." }) 模式
3. 确认各转换在图中有定义
4. 识别图中有定义但代码中未执行的转换（死转换）
5. 特别: 中间状态（例: generating_template）到最终状态（template_approved）的转换是否遗漏
```

### 2-4. API 端点 ↔ 前端 Hook 1:1 映射

**方法**: 列出所有 API route 和前端 Hook，确认配对。

```
验证步骤:
1. 从 src/app/api/ 下 route.ts 提取 HTTP 方法别端点列表
2. 从 src/hooks/ 下 use*.ts 提取 fetch 调用 URL 列表
3. 识别 API 端点中 Hook 未调用的 → "未使用"标记
4. 判断"未使用"是刻意（管理 API 等）还是遗漏（调用缺失）
```

---

## 3. QA Agent 设计原则

### 3-1. 使用 general-purpose 而非 Explore 类型

QA Agent 为 `Explore` 类型则只能读取。但有效 QA 需要:
- Grep 模式搜索（提取所有 `NextResponse.json()`）
- 脚本执行自动对照（API shape vs Hook 类型）
- 必要时可修改

**推荐**: 设为 `general-purpose` 类型，但在 Agent 定义中明确"验证 → 报告 → 修改请求"协议。

### 3-2. 检查清单优先"交叉对比"而非"存在确认"

| 弱检查清单 | 强检查清单 |
|---------------|---------------|
| API 端点是否存在？ | API 端点响应 shape 与对应 Hook 类型是否一致？ |
| 状态转换图是否定义？ | 所有 status 更新代码与图的转换是否一致？ |
| 页面文件是否存在？ | 代码中所有链接是否指向实际存在的页面？ |
| TypeScript strict mode？ | 是否存在泛型转换绕过的类型安全性？ |

### 3-3. "同时读两侧"原则

QA 要抓边界 Bug，不能只读一侧。必须:
- API route **和** 对应 Hook **一起** 读
- 状态转换图 **和** 实际更新代码 **一起** 读
- 文件结构 **和** 链接路径 **一起** 读

在 Agent 定义中明确记载此原则。

### 3-4. QA 在构建后执行，而非每个模块完成后执行

编排器中将 QA 仅放在"Phase 4: 整体完成后"则:
- Bug 累积导致修复成本高
- 早期边界不一致传播到后续模块

**推荐模式**: 每个后端 API 完成时立即执行该 API + 对应 Hook 的交叉验证（incremental QA）。

---

## 4. 验证检查清单模板

QA Agent 定义中包含的 Web 应用集成一致性检查清单。

```markdown
### 集成一致性验证（Web 应用）

#### API ↔ 前端连接
- [ ] 所有 API route 的响应 shape 与对应 Hook 的泛型类型一致
- [ ] 包装响应({ items: [...] })在 Hook 中解包确认
- [ ] snake_case ↔ camelCase 转换一致应用
- [ ] 即时响应(202)与最终结果的 shape 在前端中区分确认
- [ ] 所有 API 端点有对应前端 Hook 且实际被调用

#### 路由一致性
- [ ] 代码中所有 href/router.push 值与实际 page 文件路径匹配
- [ ] 考虑 route group ((group)) 从 URL 中移除的路径验证
- [ ] 动态段([id])以正确参数填充确认

#### 状态机一致性
- [ ] 所有定义的状态转换在代码中执行（无死转换）
- [ ] 代码中所有 status 更新在转换图中有定义（无非法转换）
- [ ] 中间状态到最终状态的转换无遗漏
- [ ] 前端状态分支(if status === "X")的 X 实际可达

#### 数据流一致性
- [ ] DB schema 字段名与 API 响应字段名的映射一致
- [ ] 前端类型定义与 API 响应字段名一致
- [ ] 可选字段的 null/undefined 处理两侧一致
```

---

## 5. QA Agent 定义模板

构建 Harness 的 QA Agent 包含的核心章节。

```markdown
---
name: qa-inspector
description: "QA 验证专家。验证规范遵守、集成一致性、设计质量。"
---

# QA Inspector

## 核心角色
验证规范对应的实现质量和 **模块间集成一致性**。

## 验证优先级

1. **集成一致性**（最高）— 边界不一致是运行时错误的主因
2. **功能规范遵守** — API/状态机/数据模型
3. **设计质量** — 颜色/字体/响应式
4. **代码质量** — 未使用代码、命名规则

## 验证方法: "同时读两侧"

边界验证必须 **同时打开两侧代码** 进行比较:

| 验证对象 | 左侧（生产者） | 右侧（消费者） |
|----------|-------------|---------------|
| API 响应 shape | route.ts 的 NextResponse.json() | hooks/ 的 fetchJson<T> |
| 路由 | src/app/ page 文件路径 | href、router.push 值 |
| 状态转换 | STATE_TRANSITIONS 图 | .update({ status }) 代码 |
| DB → API → UI | 表列名 | API 响应字段 → 类型定义 |

## 团队通信协议

- 发现后立即向对应 Agent 发送具体修改请求（文件:行号 + 修改方法）
- 边界问题通知 **两侧** Agent
- 向 Leader 发送: 验证报告（通过/失败/未验证项区分）
```

---

## 实际案例: SatangSlide 发现的 Bug

本指南所有内容来源于以下实际 Bug 的教训:

| Bug | 边界 | 原因 |
|------|--------|------|
| `projects?.filter is not a function` | API→Hook | API 返回 `{projects:[]}`，Hook 期望数组 |
| 仪表盘所有链接 404 | 文件路径→href | `/dashboard/` 前缀遗漏 |
| 主题图片不显示 | API→组件 | `thumbnailUrl` vs `thumbnail_url` |
| 主题选择未保存 | API→Hook | select-theme API 存在，Hook 不存在 |
| 生成页永远等待 | 状态转换→代码 | `template_approved` 转换代码遗漏 |
| `data.failedIndices` 崩溃 | 即时响应→前端 | 在即时响应中访问后台结果 |
| 完成后幻灯片查看 404 | 文件路径→href | `/projects/` → `/dashboard/projects/` |
