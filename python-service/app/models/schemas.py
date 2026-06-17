from pydantic import BaseModel, Field
from typing import Dict, Optional


class ParseResponse(BaseModel):
    """文档解析响应。"""
    filename: str
    markdown: str
    source_format: str = Field(
        default="",
        description="源文件格式（小写扩展名，例如 pdf/docx/pptx/md/txt/html）",
    )
    metadata: Dict[str, str] = Field(
        default_factory=dict,
        description="附加元数据，例如页数、标题、作者等",
    )


class HealthResponse(BaseModel):
    """健康检查响应。"""
    status: str = "ok"
    service: str = "python-service"
    version: str = "1.0.0"
