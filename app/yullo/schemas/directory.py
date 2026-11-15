from uuid import UUID

from pydantic import BaseModel


class PublicSpaceIcon(BaseModel):
    id: UUID
    name: str
    handle: str
    icon_url: str | None = None
    url: str


class PublicSpaceDirectory(BaseModel):
    items: list[PublicSpaceIcon]
    next_cursor: UUID | None = None
