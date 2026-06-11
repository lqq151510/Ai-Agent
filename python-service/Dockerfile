FROM python:3.10-slim

WORKDIR /app

# 增加非 root 用户
RUN adduser --disabled-password --no-create-home appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

# 切换非 root 用户执行
USER appuser

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
