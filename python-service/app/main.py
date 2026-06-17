import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import parse
from app.models.schemas import HealthResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MarkItDown RAG Parser API", version="1.0.0")

# CORS 配置：允许后端 backend 调用
# 默认允许本地后端常用端口；可通过环境变量 PYTHON_SERVICE_CORS_ORIGINS 扩展
import os

_default_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8088",
    "http://127.0.0.1:8088",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_extra_origins = os.getenv("PYTHON_SERVICE_CORS_ORIGINS", "")
if _extra_origins:
    _default_origins.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse.router)


@app.get("/health", response_model=HealthResponse)
async def health():
    """健康检查端点，供后端探活使用。"""
    return HealthResponse(status="ok", service="python-service", version="1.0.0")


@app.get("/")
async def root():
    """根路径，返回服务基本信息。"""
    return {"service": "python-service", "status": "running", "docs": "/docs"}
