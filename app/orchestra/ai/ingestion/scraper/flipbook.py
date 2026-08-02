"""
FlipHTML5 flipbook recovery.

A FlipHTML5 "flipbook" page (common for bank/product brochures) is an HTML
shell: the page itself carries almost no text and loads a viewer via
scripts. It is NOT a client-rendered SPA in the browser sense though — every
piece of content is a plain static asset on the same host, referenced from
`javascript/config.js`:

    var bookConfig = {
        bookTitle: "SBI Card Prime",
        DownloadURL: "./files/pdf-file.pdf",              // the source document
        searchTextJS: "files/search/book_config.js",      // per-page text layer
        ...
    };

so we can recover the real content with ordinary HTTP instead of telling the
user "nothing to index". Prefer the source PDF (highest fidelity, reuses the
whole PDF pipeline, keeps scans/tables); fall back to the per-page text layer
(flattened text, structure lost) when the PDF is absent or unreachable.

Safety: config.js and the assets are only ever fetched relative to the shell
page's own (already validated) host, and every target still passes through
validate_url(), so resolving a flipbook cannot hop into private address space.
"""

from __future__ import annotations

import json
import re
from typing import List, Optional
from urllib.parse import urljoin, urlparse

from app.orchestra.ai.ingestion.scraper.base import FetchedPage, ScrapeError, ScraperConfig
from app.orchestra.ai.ingestion.scraper.providers import _stream_fetch
from app.orchestra.ai.ingestion.scraper.safety import validate_url

# Markers searched in the HTML shell's head. The shell references the viewer's
# config script, so any of these being present means "this is a flipbook".
_FLIPBOOK_MARKERS = (
    b"javascript/config.js",
    b"flipHtml5",
    b"fliphtml5_pages",
    b"bookConfig",
    b"book_config.js",
)

_CONFIG_URL = "javascript/config.js"

# Only the head is searched — every marker lives in <script src> tags there.
_FLIPBOOK_MARKERS_SCOPE = 256 * 1024


def detect_flipbook(raw_html: bytes) -> bool:
    """True if the fetched HTML looks like a FlipHTML5 shell."""
    return any(m in raw_html[:_FLIPBOOK_MARKERS_SCOPE] for m in _FLIPBOOK_MARKERS)


def _config_value(raw: bytes, key: str) -> str:
    """Pull a string-valued field out of `var bookConfig = {...}`."""
    m = re.search(
        rb"\b" + key.encode() + rb"\s*:\s*[\"']([^\"']*)[\"']",
        raw,
    )
    return m.group(1).decode("utf-8", "ignore") if m else ""


def _extract_text_for_pages(raw: bytes) -> List[str]:
    """Pull the string array out of `var textForPages = [...];`."""
    text = raw.decode("utf-8", "ignore")
    m = re.search(r"textForPages\s*=\s*(\[[\s\S]*?\])\s*;", text)
    if not m:
        return []
    try:
        pages = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []
    return [p for p in pages if isinstance(p, str) and p.strip()]


async def resolve_flipbook(shell_url: str, cfg: ScraperConfig) -> Optional[FetchedPage]:
    """
    Recover the real content of a FlipHTML5 shell.

    Returns None when the book's assets can't be reached or parsed — the
    caller keeps the shell, and the preview's "little text extracted" warning
    still surfaces instead of a silent failure.
    """
    config_url = urljoin(shell_url, _CONFIG_URL)
    try:
        raw_config, _, _, _ = await _stream_fetch(config_url, cfg)
    except ScrapeError:
        return None

    title = _config_value(raw_config, "bookTitle")
    if not title:
        title = urlparse(shell_url).hostname or shell_url

    # Prefer the source PDF. A missing or oversized PDF falls through to the
    # text layer rather than giving up.
    download = _config_value(raw_config, "DownloadURL")
    if download:
        try:
            pdf_url = validate_url(urljoin(shell_url, download),
                                   allow_private_hosts=cfg.allow_private_hosts)
            raw, final_url, content_type, status_code = await _stream_fetch(pdf_url, cfg)
            return FetchedPage(
                raw=raw,
                final_url=final_url,
                content_type=content_type or "application/pdf",
                filename="page.pdf",
                title=title[:200],
                status_code=status_code,
            )
        except ScrapeError:
            pass

    # Fallback: the searchable per-page text layer.
    search_text = _config_value(raw_config, "searchTextJS")
    if search_text:
        try:
            text_url = validate_url(urljoin(shell_url, search_text),
                                    allow_private_hosts=cfg.allow_private_hosts)
            raw_text, _, _, _ = await _stream_fetch(text_url, cfg)
        except ScrapeError:
            return None
        pages = _extract_text_for_pages(raw_text)
        if pages:
            body = "\n\n--- page break ---\n\n".join(pages).encode("utf-8", "ignore")
            return FetchedPage(
                raw=body,
                final_url=shell_url,
                content_type="text/plain",
                filename="page.txt",
                title=title[:200],
                status_code=200,
            )

    return None
