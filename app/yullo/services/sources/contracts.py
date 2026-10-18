from typing import Optional, Literal, Union
from uuid import UUID
from pydantic import BaseModel, Field

class TextSourceInput(BaseModel):
    source_type: Literal["text"] = "text"
    title: str
    text: str

class UrlSourceInput(BaseModel):
    source_type: Literal["url"] = "url"
    url: str
    title: Optional[str] = None

class FileSourceInput(BaseModel):
    source_type: Literal["file"] = "file"
    title: str
    blob_key: str
    mime_type: str

SourceInput = Union[TextSourceInput, UrlSourceInput, FileSourceInput]

class SourceAccepted(BaseModel):
    item_id: UUID
    job_id: UUID
    source_version: int
    status: Literal["queued", "uploaded"] = "uploaded"
