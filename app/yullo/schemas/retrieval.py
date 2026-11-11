from typing import List, Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field

class YulloExecutionContext(BaseModel):
    space_id: UUID
    kb_ids: List[UUID]
    published_version: Optional[int] = None
    is_preview: bool = False

class RetrievedContext(BaseModel):
    """Search results and existing approved records for one chat request; not persisted."""
    structured_facts: List[dict] = Field(default_factory=list)
    images: List[dict] = Field(default_factory=list)
    passages: List[dict] = Field(default_factory=list)
    links: List[dict] = Field(default_factory=list)
    # Request-local server allowlist, never persisted or supplied by the user.
    continuations: List[dict] = Field(default_factory=list)
    sufficiency: Literal["supported", "missing", "conflicting"] = "missing"
    retrieval_status: Literal["success", "empty", "unavailable", "disabled"] = "empty"
    record_ranking_status: Literal["success", "unavailable"] = "success"
    query_embedding: Optional[List[float]] = Field(default=None, exclude=True, repr=False)


# Compatibility for existing callers; this is the same model, not another layer.
EvidencePack = RetrievedContext
