# 知识工作台 API 契约

> 版本：v0.1
> 日期：2026-06-25
> 状态：后端骨架已落地

---

## 1. 目标

这份文档不是重新描述领域设计，而是给前端联调用。它回答 4 件事：

1. 页面该调哪些接口
2. 请求和响应长什么样
3. 当前骨架版有哪些明确行为
4. 哪些地方现在还是占位，不要误接

---

## 2. 认证与通用约定

- Base URL：`/api/v1`
- 认证方式：`Authorization: Bearer <token>`
- 响应格式：当前知识工作台接口直接返回业务 JSON，不包外层 `data`
- 时间字段：ISO-8601 字符串，例如 `2026-06-25T10:30:00Z`
- UUID 字段：标准 UUID 字符串

### 2.1 通用错误响应

```json
{
  "code": "BAD_REQUEST",
  "message": "Unsupported sourceType: docx",
  "requestId": "req_123456",
  "timestamp": "2026-06-25T10:30:00Z"
}
```

常见状态码：

- `400`：参数不合法、枚举值不支持、业务前置条件不满足
- `401`：未登录
- `403`：访问了别人的资源
- `404`：资源不存在
- `409`：资源冲突，例如模型源仍被个人中心引用
- `502`：模型源探活失败

---

## 3. 枚举约定

### 3.1 设置

- `organizeMode`：`manual` | `auto`
- `privacyMode`：`local_first` | `cloud_first`

### 3.2 模型源

- `providerType`：`openai` | `deepseek` | `openrouter` | `local_compatible` | `anthropic`
- `lastCheckStatus`：`ok` | `error` | `unknown`

### 3.3 知识条目

- `sourceType`：`web` | `markdown` | `pdf` | `snippet`
- `status`：`inbox` | `processing` | `ready` | `failed` | `archived`
- `sourceAsset.origin`：`picker` | `watched_folder`
- `sourceAsset.availability`：`pending` | `available` | `missing`

`sourceAsset` 是可选的受管原件安全元数据。它只包含 `id`、`originalFilename`、`mediaType`、`byteSize`、`origin`、`availability`；不会包含本机路径、受管库相对路径、存储键、文件内容或内容哈希。

### 3.4 任务流水

- `jobType`：`import` | `organize` | `reprocess`
- `status`：`pending` | `running` | `succeeded` | `failed`

---

## 4. 页面到接口映射

### 4.1 `knowledge-desk/pages/dashboard.html`

- `GET /dashboard/summary`
- `GET /settings/storage`

### 4.2 `knowledge-desk/pages/inbox.html`

- `GET /knowledge-items?status=inbox&page=1&pageSize=20`
- `POST /knowledge-items/import/web`
- `POST /knowledge-items/import/file`
- `POST /knowledge-items/import/preflight`
- `POST /knowledge-items/import/upload`
- `POST /knowledge-items/import/snippet`
- `POST /knowledge-items/{id}/organize`
- `POST /knowledge-items/organize-batch`
- `POST /knowledge-items/{id}/reprocess`
- `POST /knowledge-items/{id}/archive`
- `GET /ingestion-jobs?limit=20`

### 4.3 `knowledge-desk/pages/library.html`

- `GET /knowledge-items?status=ready&page=1&pageSize=20`
- `GET /tags`
- `POST /knowledge-items/{id}/archive`

### 4.4 `knowledge-desk/pages/detail.html`

- `GET /knowledge-items/{id}`
- `PUT /knowledge-items/{id}`
- `POST /knowledge-items/{id}/organize`
- `POST /knowledge-items/{id}/archive`
- `POST /knowledge-items/{id}/restore`

### 4.5 `knowledge-desk/pages/search.html`

- `GET /knowledge-items/search?q=...`
- `GET /tags`

### 4.6 `knowledge-desk/pages/settings.html`

- `GET /settings/profile`
- `PUT /settings/profile`
- `GET /settings/storage`
- `GET /model-sources`
- `POST /model-sources`
- `PUT /model-sources/{id}`
- `DELETE /model-sources/{id}`
- `POST /model-sources/{id}/enable`
- `POST /model-sources/{id}/disable`
- `POST /model-sources/{id}/set-default`
- `POST /model-sources/{id}/test`
- `GET /settings/export`
- `POST /settings/import`

### 4.7 工作流补充

- `GET /ingestion-jobs?knowledgeItemId=...`
- `GET /ingestion-jobs?jobType=reprocess`
- `GET /ingestion-jobs?status=failed`

---

## 5. 个人中心与设置

### 5.1 `GET /settings/profile`

返回当前用户的个人资料和模型偏好。

响应示例：

```json
{
  "userId": "8d78f2d1-0bb0-43ea-bf8d-cae65d365d78",
  "email": "demo@example.com",
  "displayName": "泽宝",
  "avatarUrl": "https://example.com/avatar.png",
  "organizeMode": "manual",
  "privacyMode": "local_first",
  "defaultModelSourceId": "8f6c4db7-9a66-4a3a-a9ae-a2eeb8fd9b62",
  "summaryModelSourceId": null,
  "taggingModelSourceId": null,
  "createdAt": "2026-06-25T10:30:00Z",
  "updatedAt": "2026-06-25T10:30:00Z"
}
```

### 5.2 `PUT /settings/profile`

请求体：

```json
{
  "displayName": "泽宝",
  "avatarUrl": "https://example.com/avatar.png",
  "organizeMode": "manual",
  "privacyMode": "local_first",
  "defaultModelSourceId": "8f6c4db7-9a66-4a3a-a9ae-a2eeb8fd9b62",
  "summaryModelSourceId": "7b4b69c0-45db-4524-b071-6b4e52f21e76",
  "taggingModelSourceId": "7b4b69c0-45db-4524-b071-6b4e52f21e76",
  "clearDefaultModelSource": false,
  "clearSummaryModelSource": false,
  "clearTaggingModelSource": false
}
```

当前行为约定：

- 只更新传入的字段
- 模型源必须属于当前用户
- `defaultModelSourceId` 与 `clearDefaultModelSource` 不能同时传
- `summaryModelSourceId` 与 `clearSummaryModelSource` 不能同时传
- `taggingModelSourceId` 与 `clearTaggingModelSource` 不能同时传
- 模型源字段传 `null` 表示“不修改”
- 需要清空绑定时，传对应的 `clear*` 布尔值为 `true`
- 通过个人中心切换默认模型源时，会同步更新 `model_sources.isDefault`

### 5.3 `GET /settings/storage`

响应示例：

```json
{
  "totalItems": 128,
  "inboxItems": 14,
  "readyItems": 96,
  "failedItems": 3,
  "archivedItems": 15,
  "totalTags": 22,
  "totalModelSources": 4,
  "generatedAt": "2026-06-25T10:30:00Z"
}
```

### 5.4 `GET /settings/export`

返回可由本机保存为 JSON 的备份内容。该请求只读：如果当前用户尚无个人资料，响应使用默认的 `manual / local_first` 偏好，但不会因此创建记录。

备份只包含知识条目、标签和非敏感偏好，以及可选的安全 `sourceAsset` 元数据。它**不会**包含 API Key、登录/认证信息、模型源配置、受管原件二进制、路径、存储键或内容哈希，并固定返回 `modelSourcesIncluded: false`。恢复的 `sourceAsset` 会生成新 ID 且固定标为 `missing`，因此不能伪造“原件可打开”。

响应示例：

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-07-29T08:00:00Z",
  "preferences": {
    "displayName": "泽宝",
    "avatarUrl": null,
    "organizeMode": "manual",
    "privacyMode": "local_first"
  },
  "tags": [
    { "id": "tag-rag", "name": "RAG", "color": "#4F46E5", "createdAt": "2026-07-29T08:00:00Z" }
  ],
  "knowledgeItems": [
    {
      "id": "item-rag",
      "sourceType": "markdown",
      "title": "本机 RAG 笔记",
      "rawContent": "# RAG",
      "status": "ready",
      "wordCount": 2,
      "createdAt": "2026-07-29T08:00:00Z",
      "updatedAt": "2026-07-29T08:00:00Z",
      "tagIds": ["tag-rag"]
    }
  ],
  "modelSourcesIncluded": false
}
```

### 5.5 `POST /settings/import`

接收 `GET /settings/export` 的 `schemaVersion: 1` JSON 备份，并在一个事务内完成校验后合并。

- 只会新增知识条目；为导入条目生成新的 ID，不删除或覆盖已有资料
- 标签按当前用户的名称复用或创建
- 不恢复偏好、模型源、API Key 或任何认证信息；目标机器需要重新配置本机模型
- 非法版本、包含模型源、字段/枚举/长度不合法的文件会在写入前失败

响应示例：

```json
{
  "importedItems": 1,
  "createdTags": 0,
  "preferencesRestored": false,
  "modelSourcesRestored": false,
  "message": "已合并 1 条资料。"
}
```

---

## 6. 模型源管理

### 6.1 `GET /model-sources`

返回当前用户所有模型源，默认源排在前面。

响应项示例：

```json
{
  "id": "8f6c4db7-9a66-4a3a-a9ae-a2eeb8fd9b62",
  "providerType": "deepseek",
  "name": "DeepSeek 官方",
  "baseUrl": "https://api.deepseek.com",
  "apiKeyMasked": "sk-***xyz",
  "defaultModel": "deepseek-chat",
  "enabled": true,
  "isDefault": true,
  "lastCheckStatus": "ok",
  "lastCheckMessage": "Connection OK",
  "lastCheckedAt": "2026-06-25T10:30:00Z",
  "createdAt": "2026-06-25T10:00:00Z",
  "updatedAt": "2026-06-25T10:30:00Z"
}
```

### 6.2 `POST /model-sources`

请求体：

```json
{
  "providerType": "deepseek",
  "name": "DeepSeek 官方",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-xxxx",
  "defaultModel": "deepseek-chat",
  "enabled": true,
  "isDefault": true
}
```

当前行为约定：

- 同一用户下 `name` 不能重复
- `apiKey` 明文入参，后端加密存储，只回 `apiKeyMasked`
- 如果 `isDefault=true`，会清理当前用户的旧默认模型源，并同步更新 `settings.profile.defaultModelSourceId`

### 6.3 `PUT /model-sources/{id}`

请求体支持部分更新：

```json
{
  "name": "DeepSeek 备用",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-yyyy",
  "defaultModel": "deepseek-chat",
  "enabled": true,
  "isDefault": true
}
```

当前行为约定：

- `apiKey` 只有在传入非空字符串时才更新
- `isDefault=true` 会切默认
- `isDefault=false` 当前不会主动清掉默认，请走 `POST /model-sources/{id}/set-default` 设默认

### 6.4 `DELETE /model-sources/{id}`

成功返回：`204 No Content`

当前行为约定：

- 如果该模型源仍被 `defaultModelSourceId / summaryModelSourceId / taggingModelSourceId` 引用，返回 `409`

### 6.5 `POST /model-sources/{id}/enable`

返回更新后的 `ModelSourceResponse`

### 6.6 `POST /model-sources/{id}/disable`

返回更新后的 `ModelSourceResponse`

### 6.7 `POST /model-sources/{id}/set-default`

返回更新后的 `ModelSourceResponse`

### 6.8 `POST /model-sources/{id}/test`

成功响应：

```json
{
  "id": "8f6c4db7-9a66-4a3a-a9ae-a2eeb8fd9b62",
  "status": "ok",
  "message": "Connection OK",
  "checkedAt": "2026-06-25T10:30:00Z"
}
```

失败行为约定：

- 返回 `502`
- 同时仍然会把 `lastCheckStatus`、`lastCheckMessage`、`lastCheckedAt` 落库

---

## 7. 知识条目

### 7.1 `POST /knowledge-items/import/web`

请求体：

```json
{
  "title": "Transformer 架构详解",
  "url": "https://example.com/transformer",
  "content": "网页正文内容..."
}
```

当前行为约定：

- 创建一条 `sourceType=web`、`status=inbox` 的知识条目
- 同时自动记录一条 `jobType=import`、`status=succeeded` 的任务流水
- 如果用户 `organizeMode=auto`，导入后会立刻继续执行整理，响应里的最终 `status` 可能直接变成 `ready` 或 `failed`

### 7.2 `POST /knowledge-items/import/file`

请求体：

```json
{
  "title": "ReAct 论文笔记",
  "sourceType": "markdown",
  "sourceUri": "/Users/liuyongze/Documents/notes/react.md",
  "content": "# ReAct\\n\\n论文笔记正文..."
}
```

当前行为约定：

- `sourceType` 只允许 `markdown` 或 `pdf`
- 传 `web` 或 `snippet` 会返回 `400`
- 如果用户 `organizeMode=auto`，导入后会继续执行整理

### 7.3 `POST /knowledge-items/import/snippet`

请求体：

```json
{
  "title": "临时摘录",
  "content": "这是一段我手动粘贴的内容"
}
```

### 7.4 `POST /knowledge-items/import/upload`

`multipart/form-data`

表单字段：

- `file`：必填，上传的本地文档
- `title`：可选，手动覆盖标题
- `sourceAssetId`：可选；桌面主进程为已经安全写入受管原件库的文件生成的 UUID
- `sourceAssetOrigin`：可选；与 `sourceAssetId` 配对，取值 `picker` 或 `watched_folder`。未传时默认 `picker`

当前行为约定：

- 推荐给真实前端使用的文件导入入口
- 当前支持：
  - `pdf` -> `sourceType=pdf`
  - `md / markdown / txt / html / htm` -> `sourceType=markdown`
- 会把 `sourceUri` 写成 `upload://<filename>`
- 会复用现有 `MarkItDownService -> PythonParseClient` 解析链路
- 如果用户 `organizeMode=auto`，导入后会继续执行整理
- 服务端会基于上传的原始字节重新计算 SHA-256 和字节数；同一用户重复上传相同字节会在解析前返回 `409`
- 当传入 `sourceAssetId` 时，成功事务会建立 `sourceAsset` 元数据并返回它。后端不会保存或返回受管原件路径、存储键或二进制

上传前可由桌面主进程调用 `POST /knowledge-items/import/preflight` 做无内容预检：

```json
{
  "contentHashes": [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ]
}
```

`contentHashes` 必须包含 1 到 20 个 64 位十六进制 SHA-256 值。响应只返回当前用户已经存在的哈希，不返回内容、路径、条目 ID 或其他资料元数据：

```json
{
  "existingContentHashes": [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ]
}
```

预检仅用于避免无效上传；上传接口仍会重新计算哈希并由数据库唯一约束处理并发冲突。相同文件名但不同字节可以导入，不同用户之间的相同文件也不会互相冲突。renderer 只应接收主进程给出的候选结论，不应接收或存储哈希列表。

### 7.5 `POST /knowledge-items/import/snippet`

当前行为约定：

- 默认写入 `sourceType=snippet`
- 如果用户 `organizeMode=auto`，导入后会继续执行整理

### 7.6 `GET /knowledge-items`

查询参数：

- `status`：可重复传参；例如 `status=inbox&status=failed` 返回任一状态命中的并集。多个值会去重，空值忽略。
- `sourceType`：可选，取值见 [3.3 知识条目](#33-知识条目)。
- `tag`：可选，按当前用户的标签名筛选；没有匹配标签时返回空分页结果。
- `from`：可选 ISO-8601 时间戳，按 `createdAt >= from` 过滤（包含边界）。
- `to`：可选 ISO-8601 时间戳，按 `createdAt <= to` 过滤（包含边界）。
- `page`：默认 `1`；小于 `1` 时按 `1` 执行。
- `pageSize`：默认 `20`；服务端会限制在 `1` 到 `100`。

除 `status` 内部为并集外，其余已提供的筛选条件均同时生效。时间过滤基于 `createdAt`；若同时传入的 `from` 晚于 `to`，结果自然为空。

示例：

```text
GET /knowledge-items?status=inbox&status=failed&sourceType=markdown&tag=rag&from=2026-07-01T00:00:00Z&to=2026-07-31T23:59:59Z&page=1&pageSize=20
```

响应示例：

```json
{
  "items": [
    {
      "id": "cdd8985c-d0c2-4f28-a5cf-3e72719171b7",
      "sourceType": "web",
      "title": "Transformer 架构详解",
      "sourceUri": "https://example.com/transformer",
      "rawContent": "原始正文",
      "cleanedContent": "清洗后正文",
      "summary": "文章介绍了 Transformer 的核心结构与训练方式。",
      "status": "ready",
      "language": "zh",
      "wordCount": 1620,
      "tags": [
        {
          "id": "379f41bb-b3c0-4308-a412-4b72f8920b88",
          "name": "llm",
          "color": "#7a8a84",
          "createdAt": "2026-06-25T10:20:00Z"
        }
      ],
      "createdAt": "2026-06-25T10:00:00Z",
      "updatedAt": "2026-06-25T10:30:00Z",
      "archivedAt": null,
      "sourceAsset": {
        "id": "b14acff4-0a88-4fad-a0fd-574244ba1c8f",
        "originalFilename": "transformer-notes.pdf",
        "mediaType": "application/pdf",
        "byteSize": 2048,
        "origin": "picker",
        "availability": "available"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

分页响应始终包含 `items`、`total`、`page`、`pageSize`；其中 `total` 是应用全部筛选条件后的总数，`page` 与 `pageSize` 是服务端实际采用的分页值。

### 7.7 `GET /knowledge-items/search`

查询参数：

- `q`
- `tag`
- `sourceType`
- `from`
- `to`
- `page`
- `pageSize`

当前行为约定：

- 搜索范围是 `title / summary / cleanedContent`
- 时间过滤基于 `createdAt`

### 7.8 `GET /knowledge-items/{id}`

返回单条 `KnowledgeItemResponse`

### 7.9 `PUT /knowledge-items/{id}`

请求体：

```json
{
  "title": "Transformer 架构详解（精读版）",
  "summary": "聚焦注意力机制、位置编码和训练稳定性。",
  "status": "ready",
  "tags": ["llm", "transformer", "paper"]
}
```

当前行为约定：

- `status=archived` 不允许通过这个接口设置，必须走 archive 接口
- 传 `tags` 会直接覆盖原标签集合

### 7.10 `POST /knowledge-items/{id}/organize`

返回整理后的 `KnowledgeItemResponse`

当前行为约定：

- 已归档条目不能整理
- 当前骨架版是“同步整理”，请求返回时已经完成摘要、标签、语言、字数写回
- 但后端仍会记录一条 `jobType=organize` 的任务流水，状态会经历 `running -> succeeded/failed`

### 7.11 `POST /knowledge-items/organize-batch`

查询参数：

- `limit`，默认 `20`，最大 `100`
- `includeFailed`，默认 `false`

响应示例：

```json
{
  "requestedLimit": 20,
  "selectedCount": 8,
  "succeededCount": 7,
  "failedCount": 1,
  "processedItemIds": [
    "9d083f6b-5ea6-4f9d-a39f-9b4471de5506"
  ],
  "failedItemIds": [
    "a5f62236-1803-47f9-b122-573277835b1e"
  ],
  "generatedAt": "2026-06-26T10:30:00Z"
}
```

当前行为约定：

- `includeFailed=false` 时只整理 `inbox`
- `includeFailed=true` 时会同时把 `failed` 条目纳入本次批量整理
- 按 `createdAt` 升序处理，更适合清理收集箱积压
- 批量内单条失败不会中断整批执行

### 7.12 `POST /knowledge-items/{id}/reprocess`

当前行为约定：

- 用于对 `failed / ready / inbox` 条目重新整理
- 已归档或正在 `processing` 的条目不能重处理
- 会记录 `jobType=reprocess` 的任务流水

### 7.13 `POST /knowledge-items/{id}/archive`

返回更新后的 `KnowledgeItemResponse`

当前行为约定：

- 写入 `status=archived`
- 写入 `archivedAt`

### 7.14 `POST /knowledge-items/{id}/restore`

返回更新后的 `KnowledgeItemResponse`

当前行为约定：

- 如果条目已经有 `summary`，恢复后回到 `ready`
- 否则恢复后回到 `inbox`

---

## 8. 标签

### 8.1 `GET /tags`

返回当前用户全部标签，按名字升序。

### 8.2 `POST /tags`

请求体：

```json
{
  "name": "paper",
  "color": "#7a8a84"
}
```

当前行为约定：

- 同名标签已存在时直接返回已有标签
- 不传 `color` 时默认 `#7a8a84`

---

## 9. 首页摘要

### 9.1 `GET /dashboard/summary`

响应示例：

```json
{
  "totalItems": 128,
  "inboxItems": 14,
  "readyItems": 96,
  "failedItems": 3,
  "recentItems": [
    {
      "id": "cdd8985c-d0c2-4f28-a5cf-3e72719171b7",
      "title": "Transformer 架构详解",
      "status": "ready",
      "sourceType": "web",
      "updatedAt": "2026-06-25T10:30:00Z"
    }
  ],
  "topTags": [
    {
      "id": "379f41bb-b3c0-4308-a412-4b72f8920b88",
      "name": "llm",
      "color": "#7a8a84",
      "usageCount": 18
    }
  ],
  "generatedAt": "2026-06-25T10:30:00Z"
}
```

---

## 10. 导入与整理任务流水

### 10.1 `GET /ingestion-jobs`

查询参数：

- `limit`，默认 `20`，最大 `100`
- `knowledgeItemId`
- `jobType`
- `status`

响应项示例：

```json
[
  {
    "id": "bf7b9f49-7a04-4c8d-a730-e9b31bfd2e88",
    "knowledgeItemId": "cdd8985c-d0c2-4f28-a5cf-3e72719171b7",
    "jobType": "organize",
    "status": "succeeded",
    "inputSnapshot": "{\"knowledgeItemId\":\"cdd8985c-d0c2-4f28-a5cf-3e72719171b7\"}",
    "resultSnapshot": "{\"status\":\"succeeded\",\"language\":\"zh\"}",
    "errorMessage": null,
    "startedAt": "2026-06-25T10:29:50Z",
    "finishedAt": "2026-06-25T10:30:00Z",
    "createdAt": "2026-06-25T10:29:50Z"
  }
]
```

### 10.2 `GET /ingestion-jobs/{id}`

返回单条 `IngestionJobResponse`

桌面端详情页固定按 `knowledgeItemId` 读取最近 20 条记录，并按服务端的时间线顺序展示 `jobType`、`status`、失败原因和时间。界面不会渲染 `inputSnapshot` 或 `resultSnapshot`；桌面 IPC 对该路径只开放 `GET`。

---

## 11. 当前骨架版的明确限制

- `PUT /settings/profile` 目前不能通过传 `null` 来清空模型源绑定
- `POST /knowledge-items/import/file` 目前接收的是“文件内容已读好后的文本”，不是服务端直接解析本地文件
- `POST /knowledge-items/import/upload` 目前还不支持 `docx / pptx` 入知识工作台域，即使底层解析服务具备更广格式能力
- `POST /knowledge-items/{id}/organize` 当前使用启发式整理，不是大模型整理
- 全仓库 Maven 全量编译目前被其他已有模块阻塞，不代表这组知识工作台接口本身不可编译

---

## 12. 联调建议顺序

1. 先接 `settings/profile`、`settings/storage`
2. 再接 `model-sources` 全流程
3. 再接 `knowledge-items/import/*` 和 `knowledge-items`
4. 然后接 `organize`、`dashboard/summary`
5. 最后接 `ingestion-jobs`
