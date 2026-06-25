# Knowledge Desk Backend Design

> 版本：v0.1
> 日期：2026-06-25
> 状态：待用户复核

## 1. 目标

`Knowledge Desk` 是一个面向个人学习者和深度信息用户的知识工作台。一期后端目标不是做通用 AI 聊天平台，而是打通一条稳定的个人知识主链路：

`收集资料 -> 自动整理 -> 进入知识库 -> 后续检索找回`

本设计只覆盖后端骨架版，重点解决以下问题：

- 为个人用户提供账户设置与模型配置中心
- 支撑网页、Markdown、PDF、文本片段的统一知识入库
- 支撑 `Inbox / Library / Detail / Search / Dashboard` 的真实数据流
- 为后续 AI 整理、复习回顾、表达辅助预留扩展边界

## 2. 用户与场景

目标用户：

- 大学生、研究生、独立学习者
- 高频收集网页文章、本地 Markdown、PDF 资料的人
- 更偏个人使用而不是团队协作

一期核心场景：

1. 用户配置账户与第三方模型源
2. 用户导入网页链接、本地文档元信息或手动粘贴内容
3. 系统将内容作为知识条目写入 `Inbox`
4. 用户手动触发整理，系统生成摘要、标签和清洗后的内容
5. 用户在知识库、详情页和搜索页中找回信息

## 3. 范围

### 3.1 一期范围

一期只落 4 个核心域：

1. `account-settings`
2. `model-sources`
3. `knowledge-items`
4. `ingestion-jobs`

### 3.2 明确不做

以下内容不进入一期：

- RAG 问答
- 向量库与向量检索
- 浏览器插件
- 多端同步
- 团队协作
- 复习系统
- 表达辅助生成
- 知识图谱可视化
- 复杂异步 worker / MQ 编排

## 4. 领域边界

### 4.1 account-settings

职责：

- 用户基础资料
- 个人偏好
- 默认模型偏好
- 隐私与整理模式

### 4.2 model-sources

职责：

- 管理第三方模型源
- 设定默认模型源
- 测试连接状态

支持的提供方：

- `openai`
- `deepseek`
- `anthropic`
- `openrouter`
- `local_compatible`

### 4.3 knowledge-items

职责：

- 统一承接知识条目
- 为 `Inbox / Library / Detail / Search` 提供核心数据

支持的来源类型：

- `web`
- `markdown`
- `pdf`
- `snippet`

### 4.4 ingestion-jobs

职责：

- 记录导入和整理任务
- 沉淀成功、失败和错误信息

支持的任务类型：

- `import`
- `organize`
- `reprocess`

## 5. 数据模型

### 5.1 user_profiles

作用：补足用户偏好，不把所有设置继续堆进 `users`

关键字段：

- `user_id`
- `display_name`
- `avatar_url`
- `default_model_source_id`
- `summary_model_source_id`
- `tagging_model_source_id`
- `organize_mode`：`manual` / `auto`
- `privacy_mode`：`local_first` / `cloud_first`
- `created_at`
- `updated_at`

### 5.2 model_sources

作用：承接第三方模型配置中心

关键字段：

- `id`
- `user_id`
- `provider_type`
- `name`
- `base_url`
- `api_key`
- `default_model`
- `enabled`
- `is_default`
- `last_check_status`
- `last_check_message`
- `last_checked_at`
- `created_at`
- `updated_at`

约束：

- `api_key` 必须加密存储
- 每个用户最多只有一个 `is_default = true` 的模型源

### 5.3 knowledge_items

作用：知识库主表

关键字段：

- `id`
- `user_id`
- `source_type`
- `title`
- `source_uri`
- `raw_content`
- `cleaned_content`
- `summary`
- `status`：`inbox` / `processing` / `ready` / `failed` / `archived`
- `language`
- `word_count`
- `created_at`
- `updated_at`
- `archived_at`

约束：

- `Inbox` 不是独立表，而是 `status = inbox`
- `archived` 表示逻辑归档，不做硬删除

### 5.4 knowledge_tags

作用：标签字典

关键字段：

- `id`
- `user_id`
- `name`
- `color`
- `created_at`

### 5.5 knowledge_item_tags

作用：知识条目与标签的多对多关联

关键字段：

- `knowledge_item_id`
- `tag_id`

### 5.6 ingestion_jobs

作用：记录导入与整理状态流

关键字段：

- `id`
- `user_id`
- `knowledge_item_id`
- `job_type`
- `status`：`pending` / `running` / `succeeded` / `failed`
- `input_snapshot`
- `result_snapshot`
- `error_message`
- `started_at`
- `finished_at`
- `created_at`

关键规则：

- `knowledge_items.status` 表示条目当前状态
- `ingestion_jobs.status` 表示某次任务执行状态
- 两者职责不同，不能混用

## 6. 后端分层

一期沿用现有 `backend` 模块风格：

- `controller`
- `service`
- `entity`
- `repo`
- `dto`
- `infra`

建议目录：

```text
backend/src/main/java/com/agent/mvp/
  settings/
  modelsource/
  knowledge/
  ingestion/
```

分层职责：

- `controller`：参数校验、鉴权上下文、响应组装
- `service`：用例编排
- `entity + repo`：持久化模型与查询
- `dto`：请求、响应、筛选条件、状态枚举
- `infra`：API Key 加密、模型探测、文件解析适配

## 7. API 设计

### 7.1 Settings

- `GET /api/v1/settings/profile`
- `PUT /api/v1/settings/profile`
- `GET /api/v1/settings/storage`
- `POST /api/v1/settings/export`

说明：

- `export` 一期先留骨架接口，先返回任务已创建

### 7.2 Model Sources

- `GET /api/v1/model-sources`
- `POST /api/v1/model-sources`
- `PUT /api/v1/model-sources/{id}`
- `DELETE /api/v1/model-sources/{id}`
- `POST /api/v1/model-sources/{id}/enable`
- `POST /api/v1/model-sources/{id}/disable`
- `POST /api/v1/model-sources/{id}/set-default`
- `POST /api/v1/model-sources/{id}/test`

说明：

- `test` 负责连接探测并更新最近检测结果
- 现有 `users.custom_base_url/custom_api_key` 只做兼容保留，不继续扩展

### 7.3 Knowledge Intake

- `POST /api/v1/knowledge-items/import/web`
- `POST /api/v1/knowledge-items/import/file`
- `POST /api/v1/knowledge-items/import/snippet`
- `POST /api/v1/knowledge-items/{id}/organize`
- `POST /api/v1/knowledge-items/{id}/archive`
- `POST /api/v1/knowledge-items/{id}/restore`

说明：

- 文件导入一期先接收文件元信息和解析后的文本，不强依赖完整对象存储

### 7.4 Library / Inbox / Detail / Search

- `GET /api/v1/knowledge-items`
- `GET /api/v1/knowledge-items/{id}`
- `PUT /api/v1/knowledge-items/{id}`
- `GET /api/v1/knowledge-items/search`
- `GET /api/v1/tags`
- `POST /api/v1/tags`
- `GET /api/v1/dashboard/summary`

说明：

- `GET /api/v1/knowledge-items` 通过 `status`、`sourceType`、`tag`、分页参数支撑 `Inbox` 与 `Library`
- `search` 一期只做结构化过滤和文本检索

### 7.5 Jobs

- `GET /api/v1/ingestion-jobs`
- `GET /api/v1/ingestion-jobs/{id}`

说明：

- 一期不开放复杂任务编排接口

## 8. 状态流与执行策略

### 8.1 导入

导入网页、文件或片段时：

1. 创建 `knowledge_item(status = inbox)`
2. 创建 `ingestion_job(job_type = import, status = succeeded)`

解释：

- `import` 只表示内容进入系统成功
- 不代表 AI 已整理完成

### 8.2 整理

触发 `POST /api/v1/knowledge-items/{id}/organize` 时：

1. 创建 `ingestion_job(job_type = organize, status = running)`
2. 调用 `KnowledgeOrganizerService`
3. 整理成功：
   - 更新 `summary`
   - 更新 `cleaned_content`
   - 更新标签关联
   - 更新 `knowledge_item.status = ready`
   - 更新 `job.status = succeeded`
4. 整理失败：
   - 更新 `knowledge_item.status = failed`
   - 更新 `job.status = failed`
   - 写入 `job.error_message`

### 8.3 搜索

一期搜索只支持：

- `title`
- `summary`
- `cleaned_content`
- 标签过滤
- 来源类型过滤
- 时间范围过滤

实现策略：

- PostgreSQL 普通文本检索
- `ILIKE` + 条件过滤
- 不上向量库

## 9. 错误处理

沿用现有 `ApiExceptionHandler` 风格，不引入第二套错误模型。

错误约定：

- `400 Bad Request`
  - 参数校验失败
  - URL、文件元信息或模型源配置不合法
- `401 Unauthorized`
  - 未登录
- `403 Forbidden`
  - 访问或修改其他用户资源
- `404 Not Found`
  - 条目、标签、任务、模型源不存在
- `409 Conflict`
  - 默认模型源状态冲突
  - 删除仍被引用的默认模型源
- `502 Bad Gateway`
  - 第三方模型连接测试失败
- `500 Internal Server Error`
  - 不可预期异常

额外规则：

- `knowledge_items` 删除默认只做归档
- `model_sources` 删除前需检查是否仍被 `user_profiles` 引用
- 任何整理失败都必须写入 `ingestion_jobs.error_message`

## 10. 测试与验收

至少补以下验证：

1. Flyway 迁移测试
   - 新表可在 H2 环境正常启动
2. Controller 测试
   - 鉴权、参数校验、`404/403/409`
3. Service 测试
   - 默认模型源切换
   - 导入条目
   - 条目归档与恢复
   - 整理成功与失败状态流转
4. 集成流测试
   - 注册/登录
   - 新增模型源
   - 导入 `snippet`
   - 触发整理
   - `Library` 查询
   - `Search` 命中

最低验收命令：

```bash
cd /Users/liuyongze/Documents/AI-agent/backend
mvn -q test
```

## 11. 实施顺序

推荐实现顺序：

1. Flyway 迁移与实体建模
2. `model-sources` 域
3. `knowledge-items + tags` 域
4. `ingestion-jobs` 与整理状态流
5. `settings` 与 `dashboard summary`
6. 测试补齐

## 12. 当前工作区说明

本轮检查结果：

- 未发现“今天新增且与知识工作台无关”的文件
- `knowledge-desk/` 是当前相关原型目录，保留
- 已存在的桌面端改动未在本次文档提交中处理
