from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

FactReviewStatus = Literal["owner_confirmed", "rejected", "extracted"]


class FactReviewRequest(BaseModel):
    review_status: FactReviewStatus
    expected_status: str | None = None


class SourceFactResponse(BaseModel):
    id: UUID
    source_item_id: UUID
    source_version: int | None = None
    subject: str
    label: str
    value: str
    note: str | None = None
    review_status: str
    verified: bool
    source_page: int | None = None
    source_chunk_id: str | None = None
    source_locator: str
    last_verified_at: datetime | None = None


class CleanupAlertResolveRequest(BaseModel):
    action: Literal["delete", "keep"]
    fact_ids: list[UUID] | None = None
    entity_ids: list[UUID] | None = None
    expected_revision: int
    acknowledge_unverified: bool = False


class VectorChunkImage(BaseModel):
    url: str
    alt: str = ""
    title: Optional[str] = None
    destination_url: Optional[str] = None


class VectorChunkLink(BaseModel):
    title: str = "Link"
    url: str


class VectorChunkItem(BaseModel):
    id: str
    chunk_index: int = 0
    page: int = 1
    section: str = ""
    doc_id: str
    source_id: Optional[str] = None
    source_title: Optional[str] = None
    text: str = ""
    source_text: Optional[str] = None
    images: list[VectorChunkImage] = Field(default_factory=list)
    links: list[VectorChunkLink] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_table: bool = False
    is_table_row: bool = False
    row_label: Optional[str] = None
    token_estimate: int = 0


class VectorSourceSummary(BaseModel):
    source_id: str
    title: str
    indexed_doc_id: Optional[str] = None
    target_url: Optional[str] = None
    chunk_count: int = 0
    images_count: int = 0
    created_at: Optional[str] = None
    ingestion_status: Optional[str] = None
    is_confirmed: bool = False
    indexing_status: Optional[str] = None


class VectorChunksResponse(BaseModel):
    sources: list[VectorSourceSummary] = Field(default_factory=list)
    selected_source_id: Optional[str] = None
    total_chunks: int = 0
    filtered_chunks_count: int = 0
    chunks: list[VectorChunkItem] = Field(default_factory=list)
    source_images: list[dict[str, Any]] = Field(default_factory=list)


class PublicResourceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    expected_source_version: int = Field(ge=1)
    expected_revision: int = Field(ge=0)
