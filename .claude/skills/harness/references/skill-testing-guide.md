# Skill 测试与迭代改进指南

Harness 中生成的 Skill 质量验证与迭代改进方法论。SKILL.md Phase 6 的补充参考。

---

## 目录

1. 测试框架概述
2. 测试 Prompt 编写法
3. 执行测试: With-skill vs Baseline
4. 定量评估: Assertion 驱动评分
5. 专业 Agent 利用
6. 迭代改进循环
7. Description 触发验证
8. 工作空间结构

---

## 1. 测试框架概述

Skill 质量验证是 **定性评估** 和 **定量评估** 的组合。

| 评估类型 | 方法 | 适合的 Skill |
|----------|------|-----------|
| **定性** | 用户直接审查产物 | 文风、设计、创作等主观品质 |
| **定量** | assertion 驱动自动评分 | 文件生成、数据提取、代码生成等客观可验证 |

核心循环: **编写 → 测试执行 → 评估 → 改进 → 重测试**

---

## 2. 测试 Prompt 编写法

### 原则

测试 Prompt 必须是 **实际用户会输入的具体、自然语句**。抽象或人工的 Prompt 测试价值低。

### 差例

```
"处理 PDF"
"提取数据"
"生成图表"
```

### 好例

```
"下载文件夹里的 'Q4_销售额_最终_v2.xlsx' 中 C 列（销售额）和 D 列（成本）
计算利润率(%)列。然后按利润率降序排列。"
```

```
"把这个 PDF 第 3 页的表格提取为 CSV。表头是 2 行，
第一行是分类，第二行才是实际列名。"
```

### Prompt 多样性

- **正式 / 随意** 语气混合
- **显式 / 隐式** 意图混合（直接说文件格式 vs 需从上下文推断）
- **简单 / 复杂** 任务混合
- 部分包含缩写、错别字、随意表达

### 覆盖范围

2~3 个 Prompt 起步，但覆盖:
- 核心用例 1 个
- 边缘案例 1 个
- （可选）复合任务 1 个

---

## 3. 执行测试: With-skill vs Baseline

### 3-1. 对比执行结构

对每个测试 Prompt，**同时** spawn 两个 Sub Agent:

**With-skill 执行:**
```
Prompt: "{测试 Prompt}"
Skill 路径: {Skill 路径}
输出路径: _workspace/iteration-N/eval-{id}/with_skill/outputs/
```

**Baseline 执行:**
```
Prompt: "{测试 Prompt}"  （相同）
Skill: 无
输出路径: _workspace/iteration-N/eval-{id}/without_skill/outputs/
```

### 3-2. Baseline 选择

| 情境 | Baseline |
|------|----------|
| 新建 Skill | 无 Skill 执行同一 Prompt |
| 既有 Skill 改进 | 修改前 Skill 版本（保留快照） |

### 3-3. 计时数据捕获

Sub Agent 完成通知中 **即时** 保存 `total_tokens` 和 `duration_ms`。此数据仅在通知时点可访问，之后无法恢复。

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

---

## 4. 定量评估: Assertion 驱动评分

### 4-1. Assertion 编写

产物可客观验证时，定义自动评分的 assertion。

**好的 assertion:**
- 客观可判真/假
- 描述性名称，仅看结果就知道检查什么
- 验证 Skill 的核心价值

**差的 assertion:**
- 与 Skill 有无无关始终通过（例: "输出存在"）
- 需主观判断（例: "写得好"）

### 4-2. 可编程验证

assertion 可用代码验证则编写脚本。比肉眼确认更快、更可靠，每次迭代可复用。

### 4-3. Non-discriminating assertion 注意

"两种配置均 100% 通过"的 assertion 无法衡量 Skill 的差异化价值。发现此类 assertion 时移除或替换为更具挑战性的。

### 4-4. 评分结果 Schema

```json
{
  "expectations": [
    {
      "text": "利润率列已添加",
      "passed": true,
      "evidence": "E 列确认 'profit_margin_pct' 列"
    },
    {
      "text": "按利润率降序排列",
      "passed": false,
      "evidence": "无排序，保持原始顺序"
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 1,
    "total": 2,
    "pass_rate": 0.50
  }
}
```

---

## 5. 专业 Agent 利用

测试/评估过程利用专业角色 Agent 可提升品质。

### 5-1. Grader（评分员）

执行 assertion 驱动评分，从产物中提取可验证主张（claim）交叉验证。

**角色:**
- 按 assertion 判通过/失败 + 提供证据
- 从产物中提取事实性主张并验证
- 对 eval 本身品质的反馈（assertion 太容易或模糊时建议）

### 5-2. Comparator（盲比员）

将两个产物 A/B 匿名化，在不知道哪个是 Skill 结果的状态下判定品质。

**使用时机:** 想严格确认"新版本真的更好吗？"时。通常迭代改进中可省略。

**判定标准:**
- 内容: 准确性、完整度
- 结构: 组织性、格式化、可用性
- 综合评分

### 5-3. Analyzer（分析员）

从基准数据中分析统计模式:
- Non-discriminating assertion（两种配置均通过 → 无区分力）
- 高方差 eval（结果每次运行差异大 → 不稳定）
- 时间/Token 权衡（Skill 提升品质但成本也高）

---

## 6. 迭代改进循环

### 6-1. 反馈收集

向用户展示产物并获取反馈。空反馈视为"无异常"。

### 6-2. 改进原则

1. **将反馈通用化** — 仅适用测试示例的窄修改是过拟合。在原理层面修改。
2. **移除不增重的部分** — 阅读转录，Skill 在让 Agent 做非生产性工作则删除该部分。
3. **解释 Why** — 用户反馈即使简洁，也要理解为何重要，将理解反映到 Skill。
4. **重复工作打包** — 所有测试执行中生成相同辅助脚本，预先纳入 `scripts/`。

### 6-3. 迭代步骤

```
1. 修改 Skill
2. 在新 iteration-N+1/ 目录中重新执行所有测试用例
3. 向用户呈现结果（与上一 iteration 对比）
4. 收集反馈
5. 再次修改 → 重复
```

**终止条件:**
- 用户满意
- 反馈全部为空（所有产物无异常）
- 有意义的改进不再存在

### 6-4. 初稿 → 复查模式

Skill 修改时，先写初稿再 **以新视角重新阅读** 改进。不要试图一次写完美，经过初稿-复查循环。

---

## 7. Description 触发验证

### 7-1. 触发 Eval 查询编写

编写 20 个 eval 查询 — should-trigger 10 个 + should-NOT-trigger 10 个。

**查询品质标准:**
- 实际用户会输入的具体、自然语句
- 包含具体细节: 文件路径、个人上下文、列名、公司名等
- 长度、语气、格式多样化
- 聚焦 **边界案例（edge case）** 而非明确答案

**Should-trigger 查询（8~10 个）:**
- 同意图的多种表达（正式/随意）
- 未明确提 Skill/文件类型但明显需要的情况
- 非主流用例
- 与其他 Skill 竞争但本 Skill 应胜的情况

**Should-NOT-trigger 查询（8~10 个）:**
- **Near-miss 是核心** — 关键词相似但应由其他工具/Skill 处理的查询
- 明显无关查询（"写斐波那契函数"）无测试价值
- 相邻领域、模糊表达、关键词重叠但上下文不同的情况

### 7-2. 既有 Skill 冲突验证

确认新 Skill 的 description 不与既有 Skill 的触发区域重叠:

1. 收集既有 Skill 列表的 description
2. 确认新 Skill 的 should-trigger 查询不会错误触发既有 Skill
3. 发现冲突时更清晰描述 description 的边界条件

### 7-3. 自动优化（可选高级功能）

description 需要优化时:

1. 将 20 个 eval 查询按 Train(60%) / Test(40%) 分割
2. 测量当前 description 的触发准确度
3. 分析失败案例生成改进的 description
4. 以 Test set 为基准选最佳 description（非 Train set — 防过拟合）
5. 最多 5 次迭代

> 此过程用 `claude -p` 自动化脚本执行。Token 成本高，Skill 充分稳定后的最终阶段执行。

---

## 8. 工作空间结构

系统管理测试/评估结果的目录结构:

```
{skill-name}-workspace/
├── iteration-1/
│   ├── eval-descriptive-name-1/
│   │   ├── eval_metadata.json
│   │   ├── with_skill/
│   │   │   ├── outputs/
│   │   │   ├── timing.json
│   │   │   └── grading.json
│   │   └── without_skill/
│   │       ├── outputs/
│   │       ├── timing.json
│   │       └── grading.json
│   ├── eval-descriptive-name-2/
│   │   └── ...
│   └── benchmark.json
├── iteration-2/
│   └── ...
└── evals/
    └── evals.json
```

**规则:**
- eval 目录使用 **描述性名称** 而非数字（例: `eval-multi-page-table-extraction`）
- 各 iteration 保留在独立目录（禁止覆盖之前 iteration）
- `_workspace/` 不删除 — 用于事后验证和审计追溯
