from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

class RawChunk(BaseModel):
    """Represents an input text chunk from a document."""
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    @property
    def is_table_row(self) -> bool:
        return self.metadata.get("is_table_row", False)
    
    @property
    def source_page(self) -> Optional[int]:
        return self.metadata.get("page")
        
    @property
    def source_filename(self) -> str:
        return self.metadata.get("filename") or self.metadata.get("doc_name") or ""


class ExtractedFact(BaseModel):
    """An enriched fact extracted from a document by the LLM."""
    subject: str = Field(description="The product, plan, or policy exactly as written.")
    label: str = Field(description="The attribute name (e.g., 'Annual Fee', 'Coverage Limit').")
    value: str = Field(description="The value, exactly as written (e.g., '$100').")
    note: Optional[str] = Field(default=None, description="Any qualifying conditions or waivers.")
    
    # Enrichment fields
    category: str = Field(
        default="Other", description="A short, high-level category this fact belongs to (e.g., 'Fees', 'Coverage', 'Specifications')."
    )
    confidence: Literal["High", "Medium", "Low"] = Field(
        default="High", description="LLM's confidence that the extracted value is an absolute fact and not an estimate."
    )
    
    # Provenance (populated after extraction)
    source_filename: str = ""
    source_page: Optional[int] = None
    
    def unique_key(self) -> tuple[str, str]:
        """A key used for deduplication and conflict detection."""
        norm = lambda s: "".join(ch for ch in (s or "").lower() if ch.isalnum())
        return (norm(self.subject), norm(self.label))


class FactConflict(BaseModel):
    """Represents a conflict between a proposed fact and an existing verified fact."""
    existing_fact_id: str
    proposed_fact: ExtractedFact
    existing_value: str
    conflict_type: Literal["value_mismatch", "note_mismatch"]

