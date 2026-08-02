"""
HtmlParser — parses HTML from three sources:

  1. .html / .htm file  → raw bytes passed directly
  2. URL string         → fetches the page then parses
  3. Raw HTML string    → encode to bytes and parse

Usage from code:
    svc.parse(raw_bytes, "page.html")           # file
    svc.parse_url("https://example.com/page")   # URL scrape
    svc.parse_html("<h1>Hello</h1><p>...</p>")  # raw HTML string
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import structlog

from app.rag.document_parser import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.base import BaseParser

logger = structlog.get_logger()


class HtmlParser(BaseParser):
    extensions = [".html", ".htm"]

    # ── Three entry points ────────────────────────────────────────────────────

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        """Parse an HTML file given as raw bytes."""
        return self._parse_bytes(raw, source=filename)

    def parse_url(self, url: str) -> ParsedDocument:
        """Fetch a URL and parse the returned HTML."""
        import httpx
        try:
            resp = httpx.get(url, follow_redirects=True, timeout=15,
                             headers={"User-Agent": "Mozilla/5.0 (compatible; ingestion-bot)"})
            resp.raise_for_status()
        except Exception as e:
            raise RuntimeError(f"Failed to fetch '{url}': {e}")

        logger.info("ingestion.html.fetched", url=url,
                    status=resp.status_code, bytes=len(resp.content))
        return self._parse_bytes(resp.content, source=url)

    def parse_html(self, html: str, source: str = "inline") -> ParsedDocument:
        """Parse a raw HTML string directly."""
        return self._parse_bytes(html.encode(), source=source)

    # ── Core extraction ───────────────────────────────────────────────────────

    def _parse_bytes(self, raw: bytes, source: str) -> ParsedDocument:
        from bs4 import BeautifulSoup

        title = ""
        try:
            t = BeautifulSoup(raw, "html.parser").title
            title = t.string.strip() if t and t.string else ""
        except Exception:
            pass

        # Three passes, each less opinionated than the last. Real pages vary
        # enormously in how they mark up content, and returning nothing is the
        # worst possible outcome — it indexes an empty document and the failure
        # only surfaces later as a bot that can't answer.
        #
        #   1. chrome stripped + semantic tags — cleanest text on a well-built page
        #   2. chrome KEPT + semantic tags     — for sites that wrap real content
        #                                        in <header>/<footer> landmarks
        #   3. chrome kept + all body text     — for div/span-only markup
        #
        # Pass 2 exists because of a real failure: a bank's card page kept 71%
        # of its content inside <header> and the remaining 29% inside <footer>,
        # so stripping both discarded the entire page and ingestion failed with
        # "no extractable text".
        for strip_chrome, semantic_only in ((True, True), (False, True), (False, False)):
            pages = self._extract(raw, title, strip_chrome=strip_chrome,
                                  semantic_only=semantic_only)
            if any(p.text.strip() for p in pages):
                if not (strip_chrome and semantic_only):
                    logger.info("ingestion.html.fallback_used", source=source,
                                strip_chrome=strip_chrome, semantic_only=semantic_only,
                                pages=len(pages))
                break
        else:
            pages = []

        filename = Path(source).name if not source.startswith("http") else source
        logger.info("ingestion.html.done", source=source, pages=len(pages), title=title)
        return ParsedDocument(
            filename=filename,
            extension=".html",
            pages=pages,
            metadata={"source": source, "title": title},
        )

    # Never carries document content in any markup style — safe to always drop.
    _HARD_NOISE = ("script", "style", "noscript", "iframe", "svg", "canvas", "template")
    # Usually site chrome, but NOT safe to drop blindly: <header>/<footer> are
    # also legal inside <article>/<section>, and some sites wrap their whole
    # page in them. Dropped on the first pass only.
    _CHROME = ("nav", "aside", "header", "footer")

    def _extract(self, raw: bytes, title: str, *,
                 strip_chrome: bool, semantic_only: bool) -> List[ParsedPage]:
        """One extraction attempt. See _parse_bytes for how the passes differ."""
        from bs4 import BeautifulSoup, Tag

        soup = BeautifulSoup(raw, "html.parser")
        for tag in soup(list(self._HARD_NOISE) + (list(self._CHROME) if strip_chrome else [])):
            tag.decompose()

        pages:  List[ParsedPage] = []
        section = title
        buffer: List[str] = []
        page_num = 1

        def _flush():
            nonlocal page_num
            text = "\n\n".join(buffer).strip()
            if text:
                pages.append(ParsedPage(page=page_num, text=text, section=section))
                page_num += 1
            buffer.clear()

        body = soup.find("body") or soup

        if not semantic_only:
            # Last resort: the page uses divs/spans with no semantic tags at
            # all. Take the whole body as one block — cruder segmentation, but
            # real content beats a correctly-structured nothing.
            text = " ".join(body.get_text(separator=" ").split())
            return [ParsedPage(page=1, text=text, section=title)] if text else []

        for el in body.descendants:
            if not isinstance(el, Tag):
                continue
            if el.name in ("h1", "h2", "h3"):
                _flush()
                section = el.get_text(separator=" ").strip()
            elif el.name == "table":
                # Extract tables as pipe-delimited rows in their own page
                _flush()
                table_text = self._extract_table(el, section, page_num)
                if table_text:
                    pages.append(ParsedPage(page=page_num, text=table_text, section=section, is_table=True))
                    page_num += 1
            elif el.name in ("p", "li", "blockquote", "pre"):
                text = el.get_text(separator=" ").strip()
                if text:
                    buffer.append(text)

        _flush()
        return pages

    def _extract_table(self, table_tag, section: str, page_num: int) -> str:
        rows = []
        for tr in table_tag.find_all("tr"):
            cells = [td.get_text(separator=" ").strip()
                     for td in tr.find_all(["td", "th"])]
            row = " | ".join(c for c in cells if c)
            if row:
                rows.append(row)
        if not rows:
            return ""
        header = f"{section} (table):" if section else f"Table (page {page_num}):"
        return header + "\n" + "\n".join(rows)
