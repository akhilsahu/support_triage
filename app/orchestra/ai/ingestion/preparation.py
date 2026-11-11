"""Shared parsed-document preparation; no storage or product lifecycle writes."""
from dataclasses import dataclass

from app.orchestra.ai.core.document_models import Chunk, ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.chunking import ChunkConfig, chunk, get_config
from app.orchestra.ai.ingestion.chunking.sizing import CHUNKING_VERSION, token_count
from app.orchestra.ai.ingestion.parser_service import IngestionService, get_ingestion_service


@dataclass
class PreparedDocument:
    document: ParsedDocument
    chunks: list[Chunk]
    config: ChunkConfig
    strategy: str


def parse_source(raw: bytes, filename: str, *, config=None, progress_cb=None,
                 is_preview: bool = False) -> ParsedDocument:
    service = get_ingestion_service() if config is None else IngestionService(config)
    return service.parse(raw, filename, progress_cb=progress_cb, is_preview=is_preview)


def prepare_document(document: ParsedDocument, *, config=None, inline: bool = False) -> PreparedDocument:
    if not document.pages or not document.full_text.strip():
        raise ValueError("Document appears empty or has no extractable text.")
    cfg = config or get_config(document.filename)
    if inline:
        # Preserve the existing short-text/Q&A atomic policy. Do not silently
        # split a question from its answer or relax the standard chunk config.
        if len(document.pages) != 1:
            raise ValueError("Inline preparation requires one logical source block")
        page = document.pages[0]
        chunks = [Chunk(text=page.text, source_text=page.text, page=page.page,
                        chunk_index=0, section=page.section, is_table=page.is_table,
                        metadata={**page.metadata, "chunking_version": CHUNKING_VERSION,
                                  "token_count": token_count(page.text, cfg), "tokenizer": cfg.tokenizer_name,
                                  "block_type": "record", "split_mode": "record", "group_index": 0,
                                  "fragment_index": 0, "fragment_count": 1,
                                  "previous_chunk_index": -1, "next_chunk_index": -1,
                                  "continues_previous": False, "continues_next": False,
                                  "source_spans": [{"page": page.page, "page_fragment": 0,
                                                    "start": 0, "end": len(page.text)}]})]
    else:
        chunks = chunk(document, cfg)
    if not chunks:
        raise ValueError("Document produced no chunks.")
    return PreparedDocument(document, chunks, cfg, "inline" if inline else cfg.strategy.value)


def prepare_source(raw: bytes, filename: str, *, parser_config=None, chunk_config=None,
                   progress_cb=None, web: bool = False) -> PreparedDocument:
    if web and chunk_config is None:
        from app.orchestra.ai.config import get_web_chunk_config
        chunk_config = get_web_chunk_config(filename)
    return prepare_document(parse_source(raw, filename, config=parser_config, progress_cb=progress_cb),
                            config=chunk_config)


def prepare_text(text: str, *, filename: str = "kb.txt", section: str = "",
                 inline: bool = False, config=None) -> PreparedDocument:
    document = ParsedDocument(filename=filename, extension=".txt",
                              pages=[ParsedPage(page=1, text=text, section=section)])
    return prepare_document(document, config=config, inline=inline)


def count_chunk_tokens(text: str) -> int:
    """Same default tokenizer used for bounded continuation payloads."""
    return token_count(text, ChunkConfig())


def markdown_asset_blocks(text):
    """Public source-asset parsing utility; implementation remains in Orchestra."""
    from app.orchestra.ai.ingestion.parsers.markdown_links import markdown_asset_blocks as parse_blocks
    return parse_blocks(text)
