"""
ImageParser — GPT-4o mini vision for images and PDF fallback.

Primary use: .png / .jpg / .jpeg / .webp — whole image sent as one page.

PDF fallback use: when PdfParser (PyMuPDF) fails entirely (library missing,
corrupt file, unsupported encryption), the service walks the chain to here.
Each PDF page is rendered to PNG at vision_dpi and sent to GPT-4o mini
individually, so the output is still one ParsedPage per PDF page.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import List

import structlog

from app.rag.document_parser import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.base import BaseParser

logger = structlog.get_logger()

_MIME = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


class ImageParser(BaseParser):
    extensions = [".png", ".jpg", ".jpeg", ".webp"]

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        if not self.cfg.vision_enabled:
            raise ValueError("Vision is disabled. Set INGESTION_VISION_ENABLED=true")

        ext = Path(filename).suffix.lower()

        # PDF fallback path — render each page then send to vision
        if ext == ".pdf":
            return self._parse_pdf_via_vision(raw, filename)

        mime  = _MIME.get(ext, "image/png")
        text  = self._vision_call(raw, mime, filename)
        pages = [ParsedPage(page=1, text=text, section="")] if text else []
        logger.info("ingestion.image.direct", filename=filename, chars=len(text))
        return ParsedDocument(
            filename=filename, extension=ext,
            pages=pages, metadata={"mime": mime},
        )

    def _parse_pdf_via_vision(self, raw: bytes, filename: str) -> ParsedDocument:
        """Render every PDF page to PNG and send each to GPT-4o mini vision."""
        import fitz  # PyMuPDF needed to render pages — if also missing, raises cleanly
        doc    = fitz.open(stream=raw, filetype="pdf")
        pages: List[ParsedPage] = []

        for i in range(doc.page_count):
            page = doc.load_page(i)
            pix  = page.get_pixmap(dpi=self.cfg.vision_dpi)
            png  = pix.tobytes("png")
            b64  = base64.b64encode(png).decode()

            text = self._vision_call_b64(b64, "image/png", filename, page_num=i + 1)
            if text:
                pages.append(ParsedPage(page=i + 1, text=text,
                                        section=f"Page {i + 1} (vision fallback)"))

        logger.info("ingestion.image.pdf_vision_fallback",
                    filename=filename, pages=len(pages))
        return ParsedDocument(
            filename=filename, extension=".pdf",
            pages=pages,
            metadata={"page_count": doc.page_count, "mode": "vision_fallback"},
        )

    def _vision_call(self, raw: bytes, mime: str, filename: str) -> str:
        b64 = base64.b64encode(raw).decode()
        return self._vision_call_b64(b64, mime, filename)

    def _vision_call_b64(self, b64: str, mime: str, filename: str,
                         page_num: int = 1) -> str:
        try:
            from app.orchestra.ai.ingestion.parsers.vision import vision_completion
            return vision_completion(
                model=self.cfg.vision_model,
                max_tokens=self.cfg.vision_max_tokens,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self.cfg.vision_prompt},
                        {"type": "image_url",
                         "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                }],
            )
        except Exception as e:
            if self.cfg.vision_on_error == "raise":
                raise RuntimeError(
                    f"Vision failed for '{filename}' page {page_num}: {e}"
                )
            logger.warning("ingestion.image.vision_failed",
                           filename=filename, page=page_num, error=str(e))
            return ""
