import os
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from markitdown import MarkItDown

app = FastAPI(title="MarkItDown RAG Parser API")
md = MarkItDown()

@app.post("/parse")
async def parse_document(file: UploadFile = File(...)):
    """
    Accepts a file upload, saves it temporarily, processes it with MarkItDown,
    and returns the Markdown content.
    """
    try:
        # Create a temporary file to save the uploaded file
        suffix = os.path.splitext(file.filename)[1] if file.filename else ""
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Use MarkItDown to convert the document
            result = md.convert(tmp_path)
            
            return {
                "filename": file.filename,
                "markdown": result.text_content
            }
        finally:
            # Clean up the temporary file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
