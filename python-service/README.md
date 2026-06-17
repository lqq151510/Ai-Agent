# python-service

基于 FastAPI + MarkItDown 的文档解析服务，作为后端 RAG 链路的文档预处理组件。

## 功能

- 将多种格式文档统一转换为 Markdown，供 RAG 向量化与检索使用
- 支持格式：PDF、DOCX、PPTX、MD、TXT、HTML
- 对结构化文档（PDF/DOCX/PPTX）补充提取元数据（页数、段落数、幻灯片数、标题、作者等）
- 提供 `/health` 健康检查端点供后端探活
- 内置 CORS 配置，允许后端 backend 调用

## API

### `POST /parse`

上传文件并解析为 Markdown。

**请求**：`multipart/form-data`，字段 `file`

**响应**：
```json
{
  "filename": "demo.pdf",
  "markdown": "# 标题\n...",
  "sourceFormat": "pdf",
  "metadata": {
    "sourceFormat": "pdf",
    "pageCount": "12",
    "title": "示例文档",
    "author": "张三"
  }
}
```

### `GET /health`

健康检查。

**响应**：
```json
{
  "status": "ok",
  "service": "python-service",
  "version": "1.0.0"
}
```

### `GET /`

服务基本信息。

### `GET /docs`

Swagger UI 交互式文档。

## 依赖

见 [requirements.txt](requirements.txt)，核心依赖：

- `fastapi` + `uvicorn`：Web 框架
- `markitdown`：通用文档转 Markdown
- `pdfplumber`：PDF 元数据与文本提取
- `python-docx`：DOCX 元数据提取
- `python-pptx`：PPTX 元数据提取
- `python-multipart`：文件上传支持

## 本地运行

```bash
cd python-service
pip install -r requirements.txt
python main.py
# 服务监听 http://0.0.0.0:8000
```

## 与后端集成方式

后端 `backend/` 通过 `PythonParseClient`（WebClient + 连接池）调用本服务的 `/parse` 接口：

1. **配置**：`backend/src/main/resources/application.yml` 中的 `app.python-service` 段
   - `base-url`：本服务地址（默认 `http://localhost:8000`）
   - `connect-timeout-ms`：连接超时（默认 3000ms）
   - `read-timeout-ms`：读取超时（默认 30000ms，文档解析可能较慢）
   - `enabled`：是否启用（默认 true）

2. **调用链路**：
   - `MarkItDownService.convertDocumentToMarkdown(File)` / `parseDocument(File)`
   - → `PythonParseClient.parse(byte[], String)`（WebClient，复用连接池）
   - → python-service `POST /parse`

3. **降级策略**：当 python-service 不可用或调用失败时，`MarkItDownService` 自动降级到原有 RestTemplate 直连逻辑（向后兼容），并记录 WARN 日志。

4. **Docker 部署**：`docker-compose.yml` 中 `python-service` 服务（端口 8000），backend 通过 `PYTHON_SERVICE_BASE_URL=http://python-service:8000` 访问，并以 `condition: service_healthy` 依赖。

5. **CORS**：本服务默认允许本地后端常用端口（8080/8088/5173）调用；可通过环境变量 `PYTHON_SERVICE_CORS_ORIGINS`（逗号分隔）追加额外来源。

## 目录结构

```
python-service/
├── app/
│   ├── api/routers/parse.py      # /parse 路由
│   ├── models/schemas.py         # Pydantic 模型
│   ├── services/parser_service.py # 解析逻辑
│   └── main.py                   # FastAPI 入口（CORS + /health）
├── main.py                       # uvicorn 启动入口
├── requirements.txt
└── Dockerfile
```
