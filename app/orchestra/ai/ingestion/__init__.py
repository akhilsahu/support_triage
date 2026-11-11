"""Public ingestion API. Product callers should use these stage functions."""
from app.orchestra.ai.ingestion.parser_service import IngestionService, get_ingestion_service
from app.orchestra.ai.ingestion.preparation import (
    PreparedDocument, count_chunk_tokens, markdown_asset_blocks, parse_source, prepare_document, prepare_source, prepare_text,
)
from app.orchestra.ai.ingestion.indexing import attach_indexed_source, embed_and_store_chunks
from app.orchestra.ai.ingestion.pipeline import parse_and_index
from app.orchestra.ai.ingestion.summarization import generate_summary

__all__ = [
    "IngestionService", "get_ingestion_service", "PreparedDocument", "parse_source",
    "prepare_document", "prepare_source", "prepare_text", "embed_and_store_chunks", "count_chunk_tokens", "parse_and_index", "generate_summary", "attach_indexed_source", "markdown_asset_blocks",
]
