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
        from bs4 import BeautifulSoup, Tag

        soup = BeautifulSoup(raw, "html.parser")

        # Strip noise
        for tag in soup(["script", "style", "nav", "footer", "header",
                         "aside", "noscript", "iframe"]):
            tag.decompose()

        title    = soup.title.string.strip() if soup.title and soup.title.string else ""
        pages:   List[ParsedPage] = []
        section  = title
        buffer:  List[str] = []
        page_num = 1

        def _flush():
            nonlocal page_num
            text = "\n\n".join(buffer).strip()
            if text:
                pages.append(ParsedPage(page=page_num, text=text, section=section))
                page_num += 1
            buffer.clear()

        body = soup.find("body") or soup
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

        filename = Path(source).name if not source.startswith("http") else source
        logger.info("ingestion.html.done", source=source, pages=len(pages), title=title)
        return ParsedDocument(
            filename=filename,
            extension=".html",
            pages=pages,
            metadata={"source": source, "title": title},
        )

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
