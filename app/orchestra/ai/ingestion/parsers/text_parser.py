"""TextParser — .txt / .md / .rst — text and Markdown extraction with source metadata."""

from __future__ import annotations

import re
from pathlib import Path
from typing import List

import structlog

from app.orchestra.ai.core.document_models import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.text_utils import decode_text
from app.orchestra.ai.ingestion.core.base import BaseParser


class TextParser(BaseParser):
    extensions = [".txt", ".md", ".rst"]

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        return _parse_text(raw, filename)


logger = structlog.get_logger()


def _parse_text(raw: bytes, filename: str) -> ParsedDocument:
    ext = Path(filename).suffix.lower()
    text = decode_text(raw)

    if ext == ".md":
        return _parse_markdown(text, filename)

    # Plain .txt / .rst — split on double newlines, group ~400 words per page
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    pages: List[ParsedPage] = []
    buffer: List[str] = []
    word_count = 0
    page = 1

    for para in paras:
        buffer.append(para)
        word_count += len(para.split())
        if word_count >= 400:
            pages.append(ParsedPage(page=page, text="\n\n".join(buffer)))
            page += 1
            buffer = []
            word_count = 0

    if buffer:
        pages.append(ParsedPage(page=page, text="\n\n".join(buffer)))

    if not pages:
        pages = [ParsedPage(page=1, text=text.strip())]

    logger.info("Text parsed", filename=filename, pages=len(pages))
    return ParsedDocument(filename=filename, extension=ext, pages=pages, metadata={"char_count": len(text)})

def _parse_markdown(text: str, filename: str) -> ParsedDocument:
    """
    Parse Markdown using markdown-it-py token stream.
    Each heading starts a new ParsedPage with section= set to the heading text.
    Body text accumulates under the current heading.
    """
    try:
        # Markdown needs block-level asset relationships. A plain heading split
        # loses which image belongs to which destination before chunking starts.
        from app.orchestra.ai.ingestion.parsers.markdown_links import markdown_content_blocks

        blocks = list(markdown_content_blocks(text))
        if blocks:
            pages = [
                ParsedPage(
                    page=index,
                    text=block["text"],
                    section=block["section"],
                    metadata={
                        "block_type": block["block_type"],
                        "heading_path": block["heading_path"],
                        "links": block["links"],
                        "images": block["images"],
                        "heading_instance": block['heading_instance'],
                    },
                )
                for index, block in enumerate(blocks, 1)
            ]
            logger.info("Markdown parsed", filename=filename, sections=len(pages), parser="content_blocks")
            return ParsedDocument(
                filename=filename,
                extension=".md",
                pages=pages,
                metadata={"char_count": len(text), "markdown_blocks": len(pages), "semantic_headings": True},
            )

        from markdown_it import MarkdownIt
        md = MarkdownIt()
        tokens = md.parse(text)

        pages: List[ParsedPage] = []
        current_section = ""
        buffer: List[str] = []
        page = 1

        def _flush():
            nonlocal page
            body = "\n\n".join(buffer).strip()
            if body:
                pages.append(ParsedPage(page=page, text=body, section=current_section))
                page += 1
            buffer.clear()

        i = 0
        while i < len(tokens):
            tok = tokens[i]
            if tok.type == "heading_open":
                _flush()
                # Next token is inline with the heading text
                if i + 1 < len(tokens) and tokens[i + 1].type == "inline":
                    current_section = tokens[i + 1].content.strip()
                    i += 2  # skip heading_open + inline
                else:
                    i += 1
            elif tok.type == "inline":
                if tok.content.strip():
                    buffer.append(tok.content.strip())
                i += 1
            elif tok.type == "fence":
                # Code block — include as-is (strip the fence markers)
                buffer.append(tok.content.strip())
                i += 1
            else:
                i += 1

        _flush()

        if not pages:
            pages = [ParsedPage(page=1, text=text.strip())]

        logger.info("Markdown parsed", filename=filename, sections=len(pages))
        return ParsedDocument(filename=filename, extension=".md", pages=pages, metadata={"char_count": len(text)})

    except ImportError:
        # Fallback: regex-based heading split
        parts = re.split(r"(?m)^(#{1,3} .+)$", text)
        pages = []
        current_section = ""
        page = 1
        for part in parts:
            part = part.strip()
            if not part:
                continue
            if re.match(r"^#{1,3} ", part):
                current_section = re.sub(r"^#+\s*", "", part)
            elif part:
                pages.append(ParsedPage(page=page, text=part, section=current_section))
                page += 1
        if not pages:
            pages = [ParsedPage(page=1, text=text.strip())]
        logger.info("Markdown parsed (fallback)", filename=filename, sections=len(pages))
        return ParsedDocument(filename=filename, extension=".md", pages=pages)
