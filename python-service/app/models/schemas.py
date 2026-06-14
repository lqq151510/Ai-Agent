from pydantic import BaseModel

class ParseResponse(BaseModel):
    filename: str
    markdown: str
