# Skill 编写指南

Harness 中生成的 Skill 品质提升详细编写指南。SKILL.md Phase 4 的补充参考。

---

## 目录

1. Description 编写模式
2. 正文编写风格
3. 输出格式定义模式
4. 示例编写模式
5. Progressive Disclosure 模式
6. 脚本打包判断标准
7. 数据 Schema 标准
8. Skill 不应包含的内容

---

## 1. Description 编写模式

Description 是 Skill 的唯一触发机制。Claude 仅通过 `available_skills` 列表中的 name + description 决定是否使用 Skill。

### 触发机制理解

Claude 倾向于不使用 Skill 处理自己基本工具就能轻松应对的简单任务。"帮我读这个 PDF"类简单请求即使 description 完美也可能不触发。越复杂、多步骤、专业化的任务，Skill 触发概率越高。

### 编写原则

1. 同时描述 **Skill 功能** + **具体触发场景**
2. 明确区分相似但不该触发的边界条件
3. 略 "pushy" — 补偿 Claude 保守判断触发的倾向

### 好例

```yaml
description: "PDF 文件读取、文本/表格提取、合并、分割、旋转、水印、
  加密/解密、OCR 等所有 PDF 操作。提及 .pdf 文件或请求
  PDF 产物时必须使用此 Skill。不仅仅'读'PDF，而是
  需要转换/编辑/分析时尤其有用。"
```

```yaml
description: "Excel/CSV/TSV 文件的列添加、公式计算、格式化、图表、
  数据清洗等所有电子表格操作。用户提及电子表格
  文件时——即使随意说'下载文件夹里的 xlsx'——
  也应使用此 Skill。"
```

### 差例

- `"处理数据的 Skill"` — 过于模糊，不清楚什么文件/操作
- `"PDF 相关工作"` — 无具体操作列举，无触发场景描述

---

## 2. 正文编写风格

### Why-First 原则

LLM 理解原因后能在边缘案例正确判断。传达上下文比强制规则有效。

**差例:**
```markdown
表格提取 ALWAYS 使用 pdfplumber。表格提取 NEVER 使用 PyPDF2。
```

**好例:**
```markdown
表格提取使用 pdfplumber。PyPDF2 专长文本提取，
无法保留表格的行/列结构。pdfplumber
识别单元格边界，返回结构化数据。
```

### 通用化原则

测试结果或反馈中发现问题时，不以特定示例做窄修改，而是 **原理层面通用化**。

**过拟合修改:**
```markdown
如果存在"Q4 销售额"列则将其转换为数字。
```

**通用化修改:**
```markdown
列名包含"销售额"、"金额"、"数量"等暗示数值的关键词时
将该列转换为数字类型。转换失败时保留原值。
```

### 命令式语气

使用"执行"、"确保"、"检查"形式，而非"可以..."、"能够..."。Skill 是指示书。

### 上下文节约

上下文窗口是公共资源。每句话都自问是否值得 Token 成本:
- "Claude 已经知道的内容？" → 删除
- "没有这个说明 Claude 会出错？" → 保留
- "一个具体示例比长说明更有效？" → 用示例替代

---

## 3. 输出格式定义模式

产物格式重要的 Skill 使用:

```markdown
## 报告结构
严格遵循以下模板:

# [标题]
## 摘要
## 核心发现
## 建议
```

格式定义简洁，包含实际示例更有效。

---

## 4. 示例编写模式

示例比长说明更有效:

```markdown
## 提交消息格式

**示例 1:**
输入: 添加 JWT Token 用户认证
输出: feat(auth): JWT 认证实现

**示例 2:**
输入: 修复登录页面密码显示按钮不工作的 Bug
输出: fix(login): 密码显示切换按钮动作修复
```

---

## 5. Progressive Disclosure 模式

### 模式 1: 按领域分离

```
bigquery-skill/
├── SKILL.md（概述 + 领域选择指南）
└── references/
    ├── finance.md（销售额、计费指标）
    ├── sales.md（商机、管道）
    └── product.md（API 使用量、功能）
```

用户问销售额时仅加载 finance.md。

### 模式 2: 条件性详细

```markdown
# DOCX 处理

## 文档生成
用 docx-js 生成新文档。→ [DOCX-JS.md](references/docx-js.md) 参考。

## 文档编辑
简单编辑直接修改 XML。
**需要跟踪修订时**: [REDLINING.md](references/redlining.md) 参考
```

### 模式 3: 大型 Reference 文件结构

300 行以上的 reference 文件顶部包含目录:

```markdown
# API 参考

## 目录
1. [认证](#认证)
2. [端点列表](#端点列表)
3. [错误码](#错误码)
4. [频率限制](#频率限制)

---

## 认证
...
```

---

## 6. 脚本打包判断标准

观察测试执行中 Agent 的转录记录。下列模式出现时打包对象:

| 信号 | 动作 |
|------|------|
| 3 个测试中 3 个生成相同辅助脚本 | 打包到 `scripts/` |
| 每次都执行相同 pip install/npm install | Skill 中明确依赖安装步骤 |
| 相同多步骤方法重复 | Skill 正文中描述为标准流程 |
| 每次类似错误后相同规避方法 | Skill 中描述已知问题与解决方案 |

打包脚本必须经过执行测试。

---

## 7. 数据 Schema 标准

Skill 间数据交换一致性用标准 Schema。Harness 中生成的 Skill 测试/评估可使用。

### eval_metadata.json

各测试用例元数据:

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "用户任务 Prompt",
  "assertions": [
    "产物包含 X",
    "以 Y 格式生成文件"
  ]
}
```

### grading.json

assertion 驱动评分结果:

```json
{
  "expectations": [
    {
      "text": "产物包含'首尔'",
      "passed": true,
      "evidence": "第 3 步确认'首尔地区数据提取'"
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  }
}
```

**字段名注意:** 严格使用 `text`、`passed`、`evidence`（禁止变体如 `name`/`met`/`details`）。

### timing.json

执行时间/Token 测量:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

Sub Agent 完成通知中的 `total_tokens` 和 `duration_ms` 即时保存。此数据仅在通知时点可访问，之后无法恢复。

---

## 8. Skill 不应包含的内容

- README.md、CHANGELOG.md、INSTALLATION_GUIDE.md 等附加文档
- Skill 创建过程的元信息（测试结果、迭代历史）
- 面向用户的说明（Skill 是 AI Agent 的指示书）
- Claude 已知的通用知识
