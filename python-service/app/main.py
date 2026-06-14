from fastapi import FastAPI
from app.api.routers import parse

app = FastAPI(title="MarkItDown RAG Parser API")

app.include_router(parse.router)
