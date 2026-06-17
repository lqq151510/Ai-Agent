import os
import tempfile
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from app.models.schemas import ParseResponse
from app.services.parser_service import parse_document, get_source_format, SUPPORTED_FORMATS

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/parse", response_model=ParseResponse)
async def parse_document_endpoint(file: UploadFile = File(...)):
    """接收文件上传，调用解析服务转换为 Markdown 并返回结构化结果。"""
    try:
        filename = file.filename or "unknown"
        suffix = os.path.splitext(filename)[1] if file.filename else ""

        # 校验扩展名是否受支持
        if suffix and suffix.lower() not in SUPPORTED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式: {suffix}。支持: {', '.join(sorted(SUPPORTED_FORMATS.keys()))}",
            )

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            while chunk := await file.read(8192):
                await run_in_threadpool(tmp.write, chunk)
            tmp_path = tmp.name

        try:
            # 在线程池中执行阻塞式解析
            markdown_content, metadata = await run_in_threadpool(parse_document, tmp_path)

            return ParseResponse(
                filename=filename,
                markdown=markdown_content,
                source_format=get_source_format(tmp_path),
                metadata=metadata,
            )
        finally:
            if os.path.exists(tmp_path):
                await run_in_threadpool(os.remove, tmp_path)

    except HTTPException:
        raise
    except ValueError as ve:
        logger.warning("文件格式或内容无效: %s", ve)
        raise HTTPException(status_code=400, detail="文件格式或内容无效。")
    except Exception as e:
        logger.error("解析文档时发生内部错误: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="解析文档时发生内部错误。")
