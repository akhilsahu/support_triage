"""
ChunkingService — picks a strategy from config and chunks a ParsedDocument.

Usage:
    svc = ChunkingService()
    chunks = svc.chunk(parsed_document)
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import structlog

from app.rag.document_parser import Chunk, ParsedDocument
from app.orchestra.ai.chunking.config import ChunkConfig, ChunkStrategy, EXTENSION_CONFIG, _DEFAULT_CONFIG

logger = structlog.get_logger()


class ChunkingService:

    def __init__(self, extension_config: Optional[Dict[str, ChunkConfig]] = None) -> None:
        self.extension_config = extension_config or EXTENSION_CONFIG

    # ── Public API ────────────────────────────────────────────────────────────

    def chunk(self, doc: ParsedDocument, config: Optional[ChunkConfig] = None) -> List[Chunk]:
        """Chunk a ParsedDocument. Strategy is derived from file extension unless overridden."""
        cfg = config or self.get_config(doc.filename)
        chunks = self._dispatch(doc, cfg)

        # Embed RAW chunk text — no context prefix baked into the vector.
        # Context (filename/section) is carried in metadata and reattached at
        # prompt-assembly time via context_enriched.enrich_for_prompt(). Opt-in
        # embed-time enrichment remains available behind cfg.context_enriched.
        if cfg.context_enriched and chunks:
            from app.orchestra.ai.chunking.strategies.context_enriched import apply_context_enriched
            chunks = apply_context_enriched(chunks, doc.filename)

        logger.info("chunking.done", filename=doc.filename,
                    strategy=cfg.strategy.value, chunks=len(chunks))
        return chunks

    def get_config(self, filename: str) -> ChunkConfig:
        ext = Path(filename).suffix.lower()
        cfg = self.extension_config.get(ext, _DEFAULT_CONFIG)
        logger.debug("chunking.config", filename=filename, ext=ext, strategy=cfg.strategy.value)
        return cfg

    # ── Internals ─────────────────────────────────────────────────────────────

    def _dispatch(self, doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
        if cfg.strategy == ChunkStrategy.BY_STRUCTURE:
            from app.orchestra.ai.chunking.strategies.by_structure import chunk_by_structure
            return chunk_by_structure(doc, cfg)

        if cfg.strategy == ChunkStrategy.PER_PAGE_ATOMIC:
            from app.orchestra.ai.chunking.strategies.per_page_atomic import chunk_per_page_atomic
            return chunk_per_page_atomic(doc, cfg)

        if cfg.strategy == ChunkStrategy.SPREADSHEET:
            from app.orchestra.ai.chunking.strategies.spreadsheet import chunk_spreadsheet
            return chunk_spreadsheet(doc, cfg)

        if cfg.strategy == ChunkStrategy.LINE_ATOMIC:
            from app.orchestra.ai.chunking.strategies.line_atomic import chunk_line_atomic
            return chunk_line_atomic(doc, cfg)

        from app.orchestra.ai.chunking.strategies.recursive import chunk_recursive
        return chunk_recursive(doc, cfg)


# ── Singleton ─────────────────────────────────────────────────────────────────

_instance: Optional[ChunkingService] = None


def get_chunking_service() -> ChunkingService:
    global _instance
    if _instance is None:
        _instance = ChunkingService()
    return _instance


def chunk(doc: ParsedDocument, config: Optional[ChunkConfig] = None) -> List[Chunk]:
    """Module-level convenience wrapper around the singleton ChunkingService."""
    return get_chunking_service().chunk(doc, config)
