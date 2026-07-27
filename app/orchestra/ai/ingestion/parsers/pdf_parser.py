"""
PdfParser — PyMuPDF with table-aware extraction + GPT-4o mini vision fallback.

Three distinct page scenarios handled:

  1. Fully scanned page (no extractable text):
       page_plain < pdf_min_text_chars → render whole page at 200 DPI → vision
       Use case: scanned insurance/policy PDFs, photographed documents.

  2. Normal text page:
       PyMuPDF block API → heading detection → table serialisation.

  3. Mixed page (text + embedded images — charts, diagrams, infographics):
       Text blocks extracted normally.
       Image blocks (type=1) → each image extracted via doc.extract_image(xref)
       and sent to vision individually. Vision output appended after page text
       so both content streams land in the same chunk with shared context.
       Use case: benefit brochures, product PDFs with embedded charts.
"""

from __future__ import annotations

import hashlib
import io
import re
from collections import Counter
from typing import List, Optional

import structlog

from app.rag.document_parser import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.base import BaseParser

logger = structlog.get_logger()


# Decorative page furniture -- guilloche watermarks, security-print borders --
# is embedded as a full-size image on every page of some documents. It carries
# no text and no information, so a vision call on it costs money and latency and
# comes back either empty or as a refusal. On the reported 54-page PDF, 55 of 59
# vision-eligible images were exactly this.
#
# Thresholds are deliberately conservative, measured against that document:
#   decorative: std 2.2 / 12.5 / 16.1   content pages: std 21.0 / 24.1 / 40.4
# so std < 8 (near-blank) and modal_frac > 0.85 (one tone dominates) sit well
# clear of real content. The ambiguous middle is left alone -- a wasted API call
# is much cheaper than silently dropping a real chart.
_BLANK_STD_MAX = 8.0
_BLANK_MODAL_FRAC_MIN = 0.85


def _is_uninformative_image(img_bytes: bytes) -> bool:
    """True for near-blank / single-tone decorative images.

    Fails OPEN: any analysis problem (missing Pillow, odd format) returns False
    so the image still goes to vision. Losing real content would be far worse
    than an unnecessary call.
    """
    try:
        import numpy as np
        from PIL import Image

        im = Image.open(io.BytesIO(img_bytes)).convert("L").resize((160, 160))
        a = np.asarray(im, dtype=np.uint8)
        if float(a.std()) < _BLANK_STD_MAX:
            return True
        hist = np.bincount(a.ravel(), minlength=256).astype(float)
        return float(hist.max() / hist.sum()) > _BLANK_MODAL_FRAC_MIN
    except Exception:
        return False


# Vision models sometimes decline an image ("I'm unable to view or extract text
# from images...") instead of describing it. That refusal is not document
# content, but it was being appended to the page text and indexed -- on the
# reported 54-page PDF it polluted 47% of the resulting chunks, so RAG could
# retrieve an apology as if it were policy text. Detect and discard it.
_VISION_REFUSAL_RE = re.compile(
    r"\b(?:i(?:'m| am)\s+(?:unable|sorry)|i\s+can(?:'t|not)\s+"
    r"(?:view|extract|read|process|assist|help)|unable\s+to\s+"
    r"(?:view|extract|read|process))\b",
    re.I,
)


def _is_vision_refusal(text: str) -> bool:
    """True when a vision reply is a refusal rather than a description.

    Deliberately requires the refusal to dominate a short reply: a genuine long
    caption that merely quotes such a phrase from the page is kept.
    """
    t = (text or "").strip()
    if not t:
        return False
    return bool(_VISION_REFUSAL_RE.search(t)) and len(t) < 400


class PdfParser(BaseParser):
    """Primary PDF parser — PyMuPDF with table detection and vision.
    Falls back to PyPdfParser via the chain in PARSER_MAP if PyMuPDF is missing."""

    extensions = [".pdf"]

    # If no new heading is detected for this many pages, the current section
    # label is more likely a heading-detection miss than a genuinely long
    # section — reset to empty rather than let a stale (possibly wrong) label
    # propagate indefinitely. An empty section is honest; a wrong one silently
    # breaks metadata filtering.
    #
    # Fallback only: the effective value comes from
    # cfg.pdf_stale_section_pages. 15 proved far too aggressive for the
    # documents this platform actually ingests — a credit-card T&C carried one
    # "TERMS & CONDITIONS" heading across 26 pages, so the reset fired mid-section
    # and stripped a correct label (and its retrieval signal, since the section
    # is prepended to chunk text) from everything after it.
    _STALE_SECTION_PAGE_LIMIT = 40

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        import fitz  # PyMuPDF — raises ImportError if not installed; service walks to PyPdfParser
        return self._parse_pymupdf(raw, filename, fitz)

    # ── PyMuPDF ───────────────────────────────────────────────────────────────

    def _parse_pymupdf(self, raw: bytes, filename: str, fitz) -> ParsedDocument:
        doc  = fitz.open(stream=raw, filetype="pdf")
        meta = {
            "title":      doc.metadata.get("title"),
            "author":     doc.metadata.get("author"),
            "page_count": doc.page_count,
        }
        # Per-document vision cache: identical image bytes (logos, watermarks,
        # repeated diagrams) otherwise cost one API call per occurrence. Keyed
        # by content hash, so reuse is exact -- no quality tradeoff. Reset per
        # document so captions never leak between files.
        self._vision_cache: dict[str, str] = {}
        self._vision_stats = {"total": 0, "api_calls": 0, "deduped": 0}
        body_size         = self._detect_body_font(doc)
        heading_threshold = body_size * 1.15

        # Detect running headers/footers/taglines up front, from raw text,
        # before anything gets classified as prose or table. Because this
        # doesn't depend on classification, the same boilerplate set filters
        # both — a repeated element gets removed wherever it lands, whether
        # that's a paragraph or a table cell. Generalizes to any PDF layout;
        # nothing here is specific to this document's text or geometry.
        boilerplate = self._detect_boilerplate_lines(doc)

        pages: List[ParsedPage] = []
        current_section = ""
        section_start_page = 0  # real page where current_section was last set (0 = none yet)
        buffer: List[str] = []
        buffer_start_page: Optional[int] = None  # real PDF page where the current buffer began

        def _flush():
            nonlocal buffer_start_page
            text = "\n".join(buffer).strip()
            if text:
                pages.append(ParsedPage(page=buffer_start_page or 1, text=text, section=current_section))
            buffer.clear()
            buffer_start_page = None

        for page_idx in range(doc.page_count):
            page      = doc.load_page(page_idx)
            page_dict = page.get_text("dict")
            page_plain = page.get_text().strip()

            # Report progress before doing the page's work. Vision-heavy pages
            # take seconds each, so this is where a background ingestion gets
            # its only meaningful "still alive, page N of M" signal.
            progress_cb = getattr(self, "_progress_cb", None)
            if progress_cb:
                try:
                    progress_cb(page_idx + 1, doc.page_count)
                except Exception:   # progress reporting must never break parsing
                    logger.debug("ingestion.pdf.progress_cb_failed", page=page_idx + 1)

            # PyMuPDF's block order follows the PDF content stream, not
            # necessarily top-to-bottom visual position — some PDFs draw
            # headings (e.g. ones inside a styled box/banner) as a separate
            # layer written after the body text that follows them. Sorting
            # by (top, left) restores true reading order before anything
            # gets classified, so a heading is never processed after the
            # paragraph underneath it. Verified against a real brochure
            # where two headings were stored last in the stream despite
            # sitting at the top of the page — without this sort, both
            # headings landed one section late.
            sorted_blocks = sorted(page_dict["blocks"], key=lambda b: (b["bbox"][1], b["bbox"][0]))

            # Stale-section safety net: if no heading has been detected in a
            # long time, stop trusting the old label — flush what's pending
            # under it and continue with an empty section rather than mislabel
            # everything from here on.
            stale_limit = getattr(self.cfg, "pdf_stale_section_pages", None) or self._STALE_SECTION_PAGE_LIMIT
            if current_section and (page_idx + 1) - section_start_page > stale_limit:
                _flush()
                current_section = ""
                section_start_page = page_idx + 1

            # ── Case 1: Fully scanned page ────────────────────────────────────
            # No text at all (or too little) → render whole page to vision.
            if len(page_plain) < self.cfg.pdf_min_text_chars:
                if self.cfg.vision_enabled:
                    vision_text = self._vision_page(page, page_idx + 1)
                    if vision_text:
                        _flush()
                        pages.append(ParsedPage(
                            page=page_idx + 1,
                            text=vision_text,
                            section=current_section or f"Page {page_idx + 1} (scanned)",
                        ))
                continue

            # ── Case 2 + 3: Text page (may also have embedded images) ─────────
            embedded_image_texts: List[str] = []

            # Layout-aware table detection for this page (ruled-line tables;
            # see _find_page_tables for why borderless tables aren't included).
            page_tables = self._find_page_tables(page) if self.cfg.pdf_table_aware else []
            emitted_table_idxs: set = set()

            for block in sorted_blocks:

                # Case 3: Embedded image block (chart, diagram, infographic)
                if block["type"] == 1 and self.cfg.vision_enabled:
                    img_text = self._vision_image_block(doc, block, page_idx + 1)
                    if img_text:
                        embedded_image_texts.append(img_text)
                    continue

                if block["type"] != 0:
                    continue

                # Case 2a: Block falls inside a table detected via PyMuPDF's
                # layout analysis — emit the table once, as markdown, and skip
                # every other block belonging to the same table region.
                table_idx = self._table_index_for_block(block.get("bbox"), page_tables)
                if table_idx is not None:
                    if table_idx not in emitted_table_idxs:
                        emitted_table_idxs.add(table_idx)
                        table_text = self._table_to_text(
                            page_tables[table_idx], current_section, page_idx + 1, boilerplate
                        )
                        if table_text:
                            if table_text.startswith("__FAKE_TABLE__"):
                                text = table_text.replace("__FAKE_TABLE__", "", 1).strip()
                                if text:
                                    if buffer_start_page is None:
                                        buffer_start_page = page_idx + 1
                                    buffer.append(text)
                            else:
                                _flush()
                                pages.append(ParsedPage(
                                    page=page_idx + 1,
                                    text=table_text,
                                    section=current_section,
                                    is_table=True,
                                ))
                    continue

                # Case 2b: Fallback heuristic — catches table-like blocks that
                # PyMuPDF's table finder missed entirely.
                if self.cfg.pdf_table_aware and self._is_table_block(block):
                    table_text = self._serialise_table(block, current_section, page_idx + 1, boilerplate)
                    if table_text:
                        if table_text.startswith("__FAKE_TABLE__"):
                            text = table_text.replace("__FAKE_TABLE__", "", 1).strip()
                            if text:
                                if buffer_start_page is None:
                                    buffer_start_page = page_idx + 1
                                buffer.append(text)
                        else:
                            _flush()
                            pages.append(ParsedPage(
                                page=page_idx + 1,
                                text=table_text,
                                section=current_section,
                                is_table=True,
                            ))
                    continue

                for line in block["lines"]:
                    line_text = " ".join(s["text"] for s in line["spans"]).strip()
                    if not line_text:
                        continue

                    # Some PDFs fake bold/emphasis by painting the same text
                    # twice (fill + stroke), which PyMuPDF surfaces as two
                    # back-to-back identical lines. Drop the exact repeat —
                    # it never carries distinct content.
                    if buffer and buffer[-1] == line_text:
                        continue
                    if line_text == current_section:
                        continue
                    if line_text in boilerplate:
                        continue

                    span = line["spans"][0] if line["spans"] else {}
                    span_size = span.get("size", 0)
                    is_bold = bool(int(span.get("flags", 0)) & 16)
                    is_larger = round(span_size) >= heading_threshold
                    # Two independent ways a line can be a heading: genuinely
                    # larger than body text, OR bold at (at least) body size —
                    # many documents set real headings in bold at the same
                    # point size as body text, which pure size-comparison
                    # never catches.
                    is_bold_only = is_bold and span_size >= body_size and not is_larger
                    is_heading = (
                        self.cfg.pdf_heading_detection
                        and (is_larger or is_bold_only)
                        and len(line_text.split()) <= 15
                        and line_text[-1] not in ".!,;"  # colon/question-mark allowed —
                        # "Exclusions:" and "Who can avail this plan?" are both real
                        # headings; FAQ-style "?"-ending headings are common enough
                        # (verified missed on a real brochure) that excluding them
                        # loses more than it protects against.
                    )
                    if is_heading and is_bold_only:
                        # Bold-at-body-size is a weak signal on its own — many
                        # documents also bold bullets, callout numbers, footer
                        # version stamps, and table/total labels. Require the
                        # line to read like an actual phrase, not a layout
                        # artifact, before trusting it (content signal). A
                        # genuine size jump (is_larger) is strong enough to
                        # skip this check.
                        #
                        # An earlier version of this guard also required the
                        # line to be the sole line in its text block (a layout
                        # isolation signal). Dropped after it caused a real
                        # regression: PyMuPDF sometimes groups a genuine
                        # heading and the paragraph right after it into one
                        # multi-line block, so the isolation check silently
                        # demoted correct headings (verified against a real
                        # 98-page policy doc — 4 legitimate section headings
                        # were lost). The content check alone still rejects
                        # bullets/page-numbers/version-codes/bare-symbol
                        # labels without that false-negative cost.
                        is_heading = self._looks_like_heading_text(line_text)
                    if is_heading:
                        _flush()
                        current_section = line_text
                        section_start_page = page_idx + 1
                    else:
                        if buffer_start_page is None:
                            buffer_start_page = page_idx + 1
                        buffer.append(line_text)

            # Append vision-extracted image content after this page's text
            for img_text in embedded_image_texts:
                if buffer_start_page is None:
                    buffer_start_page = page_idx + 1
                buffer.append(img_text)

        _flush()

        # Fallback: parsing produced no pages → one page per PDF page
        if not pages:
            for i in range(doc.page_count):
                text = doc.load_page(i).get_text().strip()
                if text:
                    pages.append(ParsedPage(page=i + 1, text=text))

        pages = self._merge_continuation_tables(pages)

        # Report real dedupe numbers so the payoff can be measured per document
        # rather than assumed -- scanned pages (one unique image each) benefit
        # little, logo/watermark-heavy files benefit a lot.
        stats = getattr(self, "_vision_stats", None)
        if stats and stats["total"]:
            logger.info("ingestion.pdf.vision_dedupe",
                        filename=filename, total=stats["total"],
                        api_calls=stats["api_calls"], skipped=stats["deduped"],
                        decorative=stats.get("blank", 0))

        logger.info("ingestion.pdf.pymupdf",
                    filename=filename, pages=len(pages), body_font=body_size)
        return ParsedDocument(filename=filename, extension=".pdf", pages=pages, metadata=meta)

    # ── Embedded image vision (Case 3) ────────────────────────────────────────

    def _vision_image_block(self, doc, block: dict, page_num: int) -> str:
        """
        Extract an embedded image from a PDF block and send to vision.
        Skips tiny images (logos, decorative borders) below _MIN_IMAGE_AREA.
        """
        try:
            import base64
            from openai import OpenAI
            from app.config import settings

            # block["image"] exists when type==1; contains raw image bytes
            # Alternatively use the xref for more format control.
            xref = block.get("xref")
            if xref:
                img_info = doc.extract_image(xref)
                img_bytes = img_info["image"]
                img_ext   = img_info.get("ext", "png")
            else:
                # Fallback: use raw bytes embedded directly in block
                img_bytes = block.get("image", b"")
                img_ext   = "png"

            if not img_bytes:
                return ""

            # Skip tiny images — probably logos or decorative elements
            w = block.get("width",  0)
            h = block.get("height", 0)
            if w * h < self.cfg.pdf_embedded_image_min_area:
                return ""

            # Reuse the caption for an image we've already described in this
            # document. A header logo repeated on every page collapses from one
            # vision call per page to exactly one, with identical output.
            cache = getattr(self, "_vision_cache", None)
            stats = getattr(self, "_vision_stats", None)
            digest = hashlib.sha256(img_bytes).hexdigest()
            if stats is not None:
                stats["total"] += 1
            if cache is not None and digest in cache:
                if stats is not None:
                    stats["deduped"] += 1
                logger.debug("ingestion.pdf.embedded_image_cached",
                             page=page_num, w=w, h=h)
                return cache[digest]

            # Skip decorative furniture before paying for a vision call.
            if _is_uninformative_image(img_bytes):
                if stats is not None:
                    stats["blank"] = stats.get("blank", 0) + 1
                if cache is not None:
                    cache[digest] = ""
                logger.info("ingestion.pdf.embedded_image_decorative",
                            page=page_num, w=w, h=h)
                return ""

            b64    = base64.b64encode(img_bytes).decode()
            mime   = f"image/{img_ext}" if img_ext != "jpg" else "image/jpeg"
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            if stats is not None:
                stats["api_calls"] += 1

            from tenacity import Retrying, stop_after_attempt, wait_exponential

            for attempt in Retrying(
                stop=stop_after_attempt(5),
                wait=wait_exponential(multiplier=1, min=2, max=20),
                reraise=True
            ):
                with attempt:
                    resp = client.chat.completions.create(
                        model=self.cfg.vision_model,
                        max_tokens=self.cfg.vision_max_tokens,
                        messages=[{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": self.cfg.vision_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                            ],
                        }],
                    )
            text = resp.choices[0].message.content or ""
            if _is_vision_refusal(text):
                # Cache the empty result too: the identical image would be
                # refused again, so this still saves the repeat API calls.
                logger.info("ingestion.pdf.embedded_image_refused",
                            page=page_num, w=w, h=h, preview=text.strip()[:80])
                text = ""
            if cache is not None:
                cache[digest] = text
            logger.info("ingestion.pdf.embedded_image_vision",
                        page=page_num, w=w, h=h, chars=len(text))
            return text
        except Exception as e:
            if self.cfg.vision_on_error == "raise":
                raise
            logger.warning("ingestion.pdf.embedded_image_vision_failed",
                           page=page_num, error=str(e))
            return ""

    # ── Whole-page vision (Case 1 — scanned) ─────────────────────────────────

    def _vision_page(self, page, page_num: int) -> str:
        """Render a full PyMuPDF page to PNG and send to GPT-4o mini vision."""
        try:
            import base64
            from openai import OpenAI
            from app.config import settings

            pix  = page.get_pixmap(dpi=self.cfg.vision_dpi)
            png  = pix.tobytes("png")
            b64  = base64.b64encode(png).decode()
            client = OpenAI(api_key=settings.OPENAI_API_KEY)

            from tenacity import Retrying, stop_after_attempt, wait_exponential

            for attempt in Retrying(
                stop=stop_after_attempt(5),
                wait=wait_exponential(multiplier=1, min=2, max=20),
                reraise=True
            ):
                with attempt:
                    resp = client.chat.completions.create(
                        model=self.cfg.vision_model,
                        max_tokens=self.cfg.vision_max_tokens,
                        messages=[{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": self.cfg.vision_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                            ],
                        }],
                    )
            text = resp.choices[0].message.content or ""
            if _is_vision_refusal(text):
                # Same problem as embedded images: a declined page would
                # otherwise be indexed as if it were the page's content.
                logger.info("ingestion.pdf.scanned_page_refused",
                            page=page_num, preview=text.strip()[:80])
                return ""
            logger.info("ingestion.pdf.scanned_page_vision", page=page_num, chars=len(text))
            return text
        except Exception as e:
            if self.cfg.vision_on_error == "raise":
                raise
            logger.warning("ingestion.pdf.vision_failed", page=page_num, error=str(e))
            return ""

    # ── Table detection (layout-aware, primary) ──────────────────────────────

    def _find_page_tables(self, page) -> list:
        """
        Detect tables on a page using PyMuPDF's built-in ruled-line table
        finder instead of guessing from span counts. Deliberately limited to
        the "lines" strategy: it requires actual ruling lines, so it never
        misclassifies prose as a table. The whitespace-alignment ("text")
        strategy was tried and dropped — on multi-paragraph pages it will
        happily sweep a heading or trailing prose paragraph into the "table"
        since nothing bounds the region, corrupting page/section metadata.
        Borderless tables (no ruling lines) fall through to the block-level
        heuristic below (_is_table_block / _serialise_table).
        """
        try:
            return list(page.find_tables(strategy="lines").tables)
        except Exception as e:
            logger.warning("ingestion.pdf.find_tables_failed", error=str(e))
            return []

    def _table_index_for_block(self, bbox, tables: list) -> Optional[int]:
        """Return the index of the table whose bbox contains this block's center, if any."""
        if not bbox or not tables:
            return None
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        for i, t in enumerate(tables):
            x0, y0, x1, y1 = t.bbox
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                return i
        return None

    def _table_to_text(self, table, section: str, pdf_page: int, boilerplate: set) -> str:
        """
        Render a detected Table as a markdown pipe-table, prefixed with its
        section/page label. Consecutive duplicate rows are collapsed to one —
        a common artifact when the source PDF draws the same content twice
        (e.g. overlapping text layers). Rows containing a known running
        header/footer are dropped outright — PyMuPDF's table finder will
        sometimes fold a nearby footer box into the same bounding region as
        a real table, adding it as a bogus extra row.
        """
        try:
            rows = table.extract()
        except Exception as e:
            logger.warning("ingestion.pdf.table_extract_failed", page=pdf_page, error=str(e))
            return ""
        if not rows:
            return ""

        deduped: list = []
        current_subcontext = ""
        for row in rows:
            # A multi-line cell (PyMuPDF keeps wrapped cell text as embedded
            # \n) would otherwise split one logical row across several output
            # lines and break markdown table syntax — collapse to one line.
            cleaned = [" ".join((c or "").split()) for c in row]
            # Substring match, not equality — a multi-line cell can concatenate
            # more than one boilerplate line (e.g. a footer's two lines joined
            # into one cell), so the cell text won't equal either line exactly.
            if any(bp in cell for cell in cleaned if cell for bp in boilerplate):
                continue
            if deduped and deduped[-1] == cleaned:
                continue
                
            # Detect sub-header rows (only one populated cell) to capture context
            non_empty = [c for c in cleaned if c]
            if len(non_empty) == 1 and len(cleaned) > 1:
                current_subcontext = non_empty[0]
                continue
                
            # Inject current sub-context into the first column if available
            if current_subcontext and cleaned and cleaned[0]:
                cleaned[0] = f"[{current_subcontext}] {cleaned[0]}"

            deduped.append(cleaned)
        if not deduped:
            return ""

        if len(deduped) == 1:
            text = " ".join(c for c in deduped[0] if c).strip()
            return f"__FAKE_TABLE__{text}"

        width = max(len(r) for r in deduped)
        md = ["| " + " | ".join(r) + " |" for r in deduped]
        md.insert(1, "|" + "|".join(["---"] * width) + "|")

        header = f"{section} (page {pdf_page}):" if section else f"Table (page {pdf_page}):"
        return header + "\n" + "\n".join(md)

    # ── Table detection (span-count fallback) ────────────────────────────────

    def _is_table_block(self, block: dict) -> bool:
        lines = block.get("lines", [])
        if len(lines) < 2:
            return False
        multi_span = sum(1 for ln in lines if len(ln.get("spans", [])) >= 2)
        return multi_span >= max(2, len(lines) * 0.6)

    def _serialise_table(self, block: dict, section: str, pdf_page: int, boilerplate: set) -> str:
        raw_rows = []
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            cells = [s["text"].strip() for s in spans if s["text"].strip()]
            if not cells:
                continue
            # Drop a row that's a known running header/footer, and drop
            # consecutive duplicate rows — both are artifacts, not data.
            # Substring match — a cell can concatenate more than one
            # boilerplate line, so it won't equal either one exactly.
            if any(bp in c for c in cells for bp in boilerplate):
                continue
            if raw_rows and raw_rows[-1] == cells:
                continue
            raw_rows.append(cells)
        if not raw_rows:
            return ""

        width = max(len(r) for r in raw_rows)
        
        rows = []
        current_subcontext = ""
        for cells in raw_rows:
            if len(cells) == 1 and width > 1:
                current_subcontext = cells[0]
                continue
            if current_subcontext and cells:
                cells[0] = f"[{current_subcontext}] {cells[0]}"
            rows.append(cells)

        if not rows:
            return ""

        if len(rows) == 1:
            text = " ".join(c for c in rows[0] if c).strip()
            return f"__FAKE_TABLE__{text}"

        width = max(len(r) for r in rows)
        md = ["| " + " | ".join(r) + " |" for r in rows]
        # Header separator after the first row so this renders as a real markdown table
        md.insert(1, "|" + "|".join(["---"] * width) + "|")

        header = f"{section} (page {pdf_page}):" if section else f"Table (page {pdf_page}):"
        return header + "\n" + "\n".join(md)

    # ── Cross-page table merge ────────────────────────────────────────────────

    def _merge_continuation_tables(self, pages: List[ParsedPage]) -> List[ParsedPage]:
        """
        Merge adjacent table pages that share the same section label.
        Handles tables that start at the bottom of one page and end at the top
        of the next — PyMuPDF produces two ParsedPages, this fuses them.
        """
        if len(pages) < 2:
            return pages
            
        def _get_column_count(text: str) -> int:
            for line in text.splitlines():
                if re.fullmatch(r"\|[\s:-]+\|", line.strip()):
                    return line.count("|") - 1
            return -1

        merged = [pages[0]]
        for curr in pages[1:]:
            prev = merged[-1]
            if (
                prev.is_table and curr.is_table 
                and prev.section == curr.section
                and curr.page > prev.page
            ):
                prev_cols = _get_column_count(prev.text)
                curr_cols = _get_column_count(curr.text)
                if prev_cols > 0 and prev_cols == curr_cols:
                    # Skip the header line of the continuation page (it restarts the table label)
                    curr_lines = curr.text.splitlines()
                    if curr_lines and curr_lines[0].endswith(":"):
                        curr_lines = curr_lines[1:]
                    # Skip a markdown separator row too — both table paths now emit
                    # real markdown, so the continuation page repeats "|---|---|"
                    if curr_lines and re.fullmatch(r"\|[\s:-]+\|", curr_lines[0]):
                        curr_lines = curr_lines[1:]
                    data_lines = curr_lines
                    merged[-1] = ParsedPage(
                        page=prev.page,
                        text=prev.text + "\n" + "\n".join(data_lines),
                        section=prev.section,
                        is_table=True,
                    )
                    continue
            merged.append(curr)
        return merged

    # ── Repeated boilerplate detection ───────────────────────────────────────

    def _detect_boilerplate_lines(self, doc) -> set:
        """
        Scan the whole document once, from raw per-page lines, before any
        page is classified as prose or table. A line that repeats verbatim
        across a large share of pages is a running header/footer/tagline,
        not real content — regardless of whether a given occurrence later
        ends up inside a paragraph or inside a table cell.

        Doing this up front (rather than only cleaning already-assembled
        prose afterward) is what makes the filtering generalize: the same
        boilerplate set is later applied to both the prose-line loop and
        both table-serialization paths, so a repeated element is removed
        wherever it lands, on any PDF, regardless of layout. Nothing here
        is specific to this document's text or geometry — it's purely
        frequency-driven.

        A line only counts once per page (repeats within a single page are
        legitimate content, not the cross-page pattern we're after) and must
        be reasonably long, so short generic lines aren't mistaken for
        boilerplate.
        """
        total_pages = doc.page_count
        if total_pages < 4:
            return set()  # too few pages for a frequency signal to be meaningful

        line_counts: dict = {}
        for pi in range(total_pages):
            seen_this_page: set = set()
            for block in doc.load_page(pi).get_text("dict")["blocks"]:
                if block["type"] != 0:
                    continue
                for line in block["lines"]:
                    text = " ".join(s["text"] for s in line["spans"]).strip()
                    text = " ".join(text.split())
                    if len(text) >= 15:
                        seen_this_page.add(text)
            for text in seen_this_page:
                line_counts[text] = line_counts.get(text, 0) + 1

        boilerplate = {ln for ln, count in line_counts.items() if count >= 3 and count / total_pages >= 0.4}
        if boilerplate:
            logger.info("ingestion.pdf.boilerplate_detected",
                        lines=len(boilerplate), pages=total_pages, samples=list(boilerplate)[:3])
        return boilerplate

    # ── Helpers ───────────────────────────────────────────────────────────────

    # Standard bullet/list-marker glyphs. A line opening with one of these
    # (followed by whitespace) is a list item, not a section title — true
    # across virtually any PDF, not specific to one document's convention.
    # Digit-led numbered headings ("10) Life Stage Option") aren't affected:
    # digits aren't in this set.
    _BULLET_CHARS = set("•‣◦▪▫●○∙·-*")

    def _looks_like_heading_text(self, text: str) -> bool:
        """
        Generic content sanity check for a bold-at-body-size heading candidate
        (the weak signal — bold without a font-size jump). Rejects lines that
        read like layout artifacts rather than a title:
          - no alphabetic content at all (a bullet glyph, a stray page number)
          - low letter density (a footer version/build code mixing digits and
            slashes, e.g. "3D/ver1/03/26/BR/ENG")
          - a final token with no alphanumeric characters (a bolded field or
            total label ending in a bare symbol, e.g. "Total Premium Paid =")
          - opens with a bullet/list marker (a callout list item, not a title)
          - a bare "<number> <short word>" pair (a chart/timeline axis label,
            e.g. "0 yrs", "15 yrs" — distinct from a numbered heading like
            "10) Life Stage Option", which has punctuation after the digit
            and more than two words)
        Purely character-composition based — not tied to this document's
        wording, so it applies the same way to any PDF.
        """
        letters = sum(1 for c in text if c.isalpha())
        non_space = sum(1 for c in text if not c.isspace())
        if non_space == 0 or letters == 0:
            return False
        if letters / non_space < 0.6:
            return False
        tokens = text.split()
        last_token = tokens[-1]
        if not any(c.isalnum() for c in last_token):
            return False
        stripped = text.lstrip()
        if stripped[0] in self._BULLET_CHARS and (len(stripped) == 1 or stripped[1].isspace()):
            return False
        if len(tokens) == 2 and tokens[0].isdigit() and len(tokens[1]) <= 4:
            return False
        return True

    def _detect_body_font(self, doc) -> float:
        sizes = []
        for pi in range(min(doc.page_count, 5)):
            for block in doc.load_page(pi).get_text("dict")["blocks"]:
                if block["type"] != 0:
                    continue
                for line in block["lines"]:
                    for span in line["spans"]:
                        if span["text"].strip():
                            sizes.append(round(span["size"]))
        if not sizes:
            return 11.0
        return Counter(sizes).most_common(1)[0][0]

