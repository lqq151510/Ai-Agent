FROM python:3.11-slim

WORKDIR /app

# 增加非 root 用户
RUN adduser --disabled-password --no-create-home appuser

# 安装系统依赖（部分解析库需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码（包含 app/ 包与入口 main.py）
COPY app/ ./app/
COPY main.py .

EXPOSE 8000

# 切换非 root 用户执行
USER appuser

# 健康检查：调用 /health 端点
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
