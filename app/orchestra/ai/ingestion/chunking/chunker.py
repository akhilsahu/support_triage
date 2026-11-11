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

from app.orchestra.ai.core.document_models import Chunk, ParsedDocument
from app.orchestra.ai.config import ChunkConfig, ChunkStrategy, EXTENSION_CONFIG, get_chunk_config as get_config

logger = structlog.get_logger()


class ChunkingService:

    def __init__(self, extension_config: Optional[Dict[str, ChunkConfig]] = None) -> None:
        self.extension_config = EXTENSION_CONFIG if extension_config is None else extension_config

    # ── Public API ────────────────────────────────────────────────────────────

    def chunk(self, doc: ParsedDocument, config: Optional[ChunkConfig] = None) -> List[Chunk]:
        """Chunk a ParsedDocument. Strategy is derived from file extension unless overridden."""
        cfg = config or self.get_config(doc.filename)
        chunks = self._dispatch(doc, cfg)

        from app.orchestra.ai.ingestion.chunking.sizing import finalize
        chunks = finalize(chunks, cfg, doc.filename)

        logger.info("chunking.done", filename=doc.filename,
                    strategy=cfg.strategy.value, chunks=len(chunks))
        return chunks

    def get_config(self, filename: str) -> ChunkConfig:
        ext = Path(filename).suffix.lower()
        cfg = get_config(filename, self.extension_config)
        logger.debug("chunking.config", filename=filename, ext=ext, strategy=cfg.strategy.value)
        return cfg

    # ── Internals ─────────────────────────────────────────────────────────────

    def _dispatch(self, doc: ParsedDocument, cfg: ChunkConfig) -> List[Chunk]:
        if cfg.strategy == ChunkStrategy.BY_STRUCTURE:
            from app.orchestra.ai.ingestion.chunking.strategies.by_structure import chunk_by_structure
            return chunk_by_structure(doc, cfg)

        if cfg.strategy == ChunkStrategy.PER_PAGE_ATOMIC:
            from app.orchestra.ai.ingestion.chunking.strategies.per_page_atomic import chunk_per_page_atomic
            return chunk_per_page_atomic(doc, cfg)

        if cfg.strategy == ChunkStrategy.SPREADSHEET:
            from app.orchestra.ai.ingestion.chunking.strategies.spreadsheet import chunk_spreadsheet
            return chunk_spreadsheet(doc, cfg)

        if cfg.strategy == ChunkStrategy.LINE_ATOMIC:
            from app.orchestra.ai.ingestion.chunking.strategies.line_atomic import chunk_line_atomic
            return chunk_line_atomic(doc, cfg)

        if cfg.strategy == ChunkStrategy.MARKDOWN_BLOCKS:
            from app.orchestra.ai.ingestion.chunking.strategies.markdown_blocks import chunk_markdown_blocks
            return chunk_markdown_blocks(doc, cfg)

        from app.orchestra.ai.ingestion.chunking.strategies.recursive import chunk_recursive
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
