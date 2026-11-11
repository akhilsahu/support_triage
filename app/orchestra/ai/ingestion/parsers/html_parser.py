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
import re
from typing import List
from urllib.parse import urljoin, urlsplit

import structlog

from app.orchestra.ai.core.document_models import ParsedDocument, ParsedPage
from app.orchestra.ai.ingestion.core.base import BaseParser
from app.orchestra.ai.ingestion.core.text_utils import clean_prose_lines

logger = structlog.get_logger()


def _inline_hidden(style: str) -> bool:
    """Read inline declarations only; never claim to evaluate external CSS."""
    declarations, buffer, quote, depth, escaped = [], [], '', 0, False
    for character in re.sub(r'/\*.*?\*/', '', style, flags=re.S):
        if escaped:
            escaped = False
        elif character == '\\':
            escaped = True
        elif quote:
            if character == quote:
                quote = ''
        elif character in ('"', "'"):
            quote = character
        elif character == '(':
            depth += 1
        elif character == ')':
            depth = max(0, depth - 1)
        elif character == ';' and not depth:
            declarations.append(''.join(buffer))
            buffer.clear()
            continue
        buffer.append(character)
    declarations.append(''.join(buffer))
    values = {}
    for declaration in declarations:
        name, separator, value = declaration.partition(':')
        name, value = name.strip().casefold(), value.strip().casefold()
        if not separator or name not in ('display', 'visibility', 'opacity'):
            continue
        important = bool(re.search(r'!\s*important\s*$', value))
        value = re.sub(r'!\s*important\s*$', '', value).strip()
        if name not in values or important or not values[name][1]:
            values[name] = (value, important)
    if values.get('display', ('',))[0] == 'none' or values.get('visibility', ('',))[0] in ('hidden', 'collapse'):
        return True
    opacity = values.get('opacity', ('',))[0]
    return bool(re.fullmatch(r'[+-]?(?:0+(?:\.0*)?|\.0+)%?', opacity))


def _heading_level(tag):
    if tag.name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
        return int(tag.name[1])
    if 'heading' in str(tag.get('role', '')).casefold().split():
        try:
            return max(1, min(6, int(tag.get('aria-level', 2))))
        except (ValueError, TypeError):
            return 2
    return None


def clean_html_content(soup, *, strip_chrome: bool = True):
    """Prefer substantive landmarks; retain a body fallback for unusual sites."""
    for tag in soup.select('script, style, noscript, iframe, svg, canvas, template, [hidden], [aria-hidden="true" i]'):
        if tag.parent is not None:
            tag.decompose()
    removed = 0
    for tag in list(soup.find_all(True)):
        if tag.parent is None:
            continue
        roles = str(tag.get('role', '')).casefold().split()
        invisible = _inline_hidden(str(tag.get('style', '')))
        dialog = tag.name == 'dialog' and not tag.has_attr('open')
        if invisible or dialog or 'navigation' in roles or (strip_chrome and ('banner' in roles or 'dialog' in roles)):
            tag.decompose()
            removed += 1
    if removed:
        logger.info('ingestion.html.ui_filtered', removed_nodes=removed, strip_chrome=strip_chrome)
    root = soup.find('body') or soup
    main = root.select_one('main, [role="main"], #pageContent, #main-content')
    if strip_chrome and main is not None and len(main.get_text(' ', strip=True)) >= 80:
        root = main
        logger.info('ingestion.html.main_content_selected')
    for tag in list(root.find_all(['nav', 'aside', 'header', 'footer'])):
        if tag.parent is None:
            continue
        # Article headers/footers may hold titles, prices and attribution.
        if tag.name in ('header', 'footer') and (not strip_chrome or tag.find_parent(['article', 'main'])
                or root is main and main is not None):
            continue
        if strip_chrome or tag.name == 'nav':
            tag.decompose()
    return root


class HtmlParser(BaseParser):
    extensions = [".html", ".htm"]

    # ── Three entry points ────────────────────────────────────────────────────

    def parse(self, raw: bytes, filename: str) -> ParsedDocument:
        """Parse an HTML file given as raw bytes."""
        return self._parse_bytes(raw, source=filename)

    def parse_url(self, url: str) -> ParsedDocument:
        """Fetch a URL and parse the returned HTML."""
        import asyncio
        from app.orchestra.ai.ingestion.scraper.registry import fetch_url

        try:
            page = asyncio.run(fetch_url(url, mode="quick"))
        except Exception as e:
            raise RuntimeError(f"Failed to fetch '{url}': {e}")

        logger.info("ingestion.html.fetched", url=url,
                    status=page.status_code, bytes=len(page.raw))
        return self._parse_bytes(page.raw, source=page.final_url)

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
                                  semantic_only=semantic_only, source=source)
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
            metadata={"source": source, "title": title, "semantic_headings": True},
        )

    def _extract(self, raw: bytes, title: str, *,
                 strip_chrome: bool, semantic_only: bool, source: str = '') -> List[ParsedPage]:
        """One extraction attempt. See _parse_bytes for how the passes differ."""
        from bs4 import BeautifulSoup, Comment, NavigableString, Tag

        soup = BeautifulSoup(raw, "html.parser")
        body = clean_html_content(soup, strip_chrome=strip_chrome)
        for anchor in list(body.find_all('a', href=True)):
            if _heading_level(anchor) or anchor.select_one('h1, h2, h3, h4, h5, h6, [role~="heading"]'):
                continue
            href = str(anchor['href']).strip()
            try:
                destination = urljoin(source if source.startswith(('http://', 'https://')) else '', href)
                if urlsplit(destination).scheme not in ('', 'http', 'https'):
                    continue
            except ValueError:
                continue
            label = anchor.get_text(' ', strip=True)
            if label and destination:
                anchor.replace_with(f'[{label}]({destination})')

        pages:  List[ParsedPage] = []
        section = title
        headings = []
        heading_instance = 0
        buffer: List[str] = []
        page_num = 1

        def _flush():
            nonlocal page_num
            text = clean_prose_lines("\n".join(buffer))
            if text:
                pages.append(ParsedPage(page=page_num, text=text, section=section,
                                        metadata={'heading_path': [label for _, label in headings] or ([title] if title else []),
                                                  'heading_instance': heading_instance}))
                page_num += 1
            buffer.clear()

        if not semantic_only:
            # Last resort: the page uses divs/spans with no semantic tags at
            # all. Take the whole body as one block — cruder segmentation, but
            # real content beats a correctly-structured nothing.
            text = " ".join(body.get_text(separator=" ").split())
            return [ParsedPage(page=1, text=text, section=title)] if text else []

        for el in body.descendants:
            if isinstance(el, NavigableString) and not isinstance(el, Comment):
                parents = list(el.parents)
                if not any(parent.name in ('p', 'li', 'blockquote', 'pre', 'table') or _heading_level(parent)
                           for parent in parents):
                    text = str(el).strip()
                    if text:
                        buffer.append(text)
                continue
            if not isinstance(el, Tag):
                continue
            if el.find_parent(['table', 'pre', 'blockquote', 'li']) is not None:
                continue
            if any(_heading_level(parent) for parent in el.parents):
                continue
            level = _heading_level(el)
            if level is not None:
                _flush()
                heading_instance += 1
                section = el.get_text(separator=" ").strip()
                while headings and headings[-1][0] >= level:
                    headings.pop()
                if section:
                    headings.append((level, section))
                else:
                    section = headings[-1][1] if headings else title
            elif el.name == "table":
                # Extract tables as pipe-delimited rows in their own page
                _flush()
                table_text = self._extract_table(el, section, page_num)
                if table_text:
                    pages.append(ParsedPage(page=page_num, text=table_text, section=section, is_table=True,
                                            metadata={'heading_path': [label for _, label in headings],
                                                      'heading_instance': heading_instance}))
                    page_num += 1
            elif el.name == 'pre':
                _flush()
                text = el.get_text().strip()
                if text:
                    pages.append(ParsedPage(page=page_num, text=text, section=section,
                                            metadata={'block_type': 'code', 'heading_path': [label for _, label in headings],
                                                      'heading_instance': heading_instance}))
                    page_num += 1
            elif el.name in ("p", "li", "blockquote"):
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
