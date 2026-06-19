---
name: example-skill
description: 这是一个示例技能，展示 Skill 格式规范
version: 1.0.0
author: user
triggers:
  - "@example"
  - "运行示例技能"
tags:
  - demo
  - template
tools:
  - name: example_tool
    description: "示例工具——返回当前时间"
    input_schema:
      type: object
      properties:
        format:
          type: string
          description: "时间格式，如 'HH:mm:ss'"
---

# Example Skill

这是一个示例技能。当 Agent 被触发时，它会读取以下指令并执行。

## 步骤

1. 首先读取当前工作目录的文件列表
2. 分析项目结构
3. 输出一个简短的摘要

## 输出格式

```
项目: {{workspacePath}}
文件数: N
类型: Maven / NPM / ...
```
