import os
import tempfile
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from app.models.schemas import ParseResponse
from app.services.parser_service import convert_with_markitdown

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/parse", response_model=ParseResponse)
async def parse_document(file: UploadFile = File(...)):
    """
    Accepts a file upload, saves it temporarily, processes it with MarkItDown,
    and returns the Markdown content.
    """
    try:
        suffix = os.path.splitext(file.filename)[1] if file.filename else ""
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            while chunk := await file.read(8192):
                await run_in_threadpool(tmp.write, chunk)
            tmp_path = tmp.name

        try:
            # Use MarkItDown to convert the document in a threadpool
            markdown_content = await run_in_threadpool(convert_with_markitdown, tmp_path)
            
            return ParseResponse(
                filename=file.filename or "unknown",
                markdown=markdown_content
            )
        finally:
            if os.path.exists(tmp_path):
                await run_in_threadpool(os.remove, tmp_path)
                
    except ValueError as ve:
        # Predictable client error (like unsupported format)
        raise HTTPException(status_code=400, detail="Invalid file format or content.")
    except Exception as e:
        logger.error(f"Internal parsing error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred during parsing.")
