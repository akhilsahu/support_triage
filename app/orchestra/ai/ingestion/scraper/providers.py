"""
Built-in scrape strategies.

"httpx" — a plain HTTP GET. Handles static HTML, PDFs, plain text and
markdown, which covers the overwhelming majority of documentation and help
pages. It does NOT execute JavaScript: a client-rendered SPA will come back
as an near-empty shell, and the caller should tell the user that rather than
silently index nothing.

One exception is resolved rather than reported: FlipHTML5 "flipbook" pages
look like empty shells but keep all their content as server-side static
assets (the source PDF, or a per-page text layer). The httpx provider
recognises the shell and recovers that content — see flipbook.py.

For the remaining JS-rendered sites the intended extension is a headless
provider (playwright / selenium) registered under another name — see
registry.py. It's deliberately not implemented here: it would pull a browser
runtime into the image for a case most deployments never hit.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple
from urllib.parse import urljoin, urlparse

import structlog

from app.orchestra.ai.ingestion.scraper.base import FetchedPage, ScrapeError, ScraperConfig
from app.orchestra.ai.ingestion.scraper.registry import register
from app.orchestra.ai.ingestion.scraper.safety import validate_url

logger = structlog.get_logger()

_TITLE_RE = re.compile(rb"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)

# Only the first chunk is searched — <title> lives in <head>, and scanning a
# multi-MB body for it would be wasted work.
_TITLE_SEARCH_BYTES = 65536


def _extract_title(raw: bytes) -> str:
    m = _TITLE_RE.search(raw[:_TITLE_SEARCH_BYTES])
    if not m:
        return ""
    try:
        return " ".join(m.group(1).decode("utf-8", "ignore").split())[:200]
    except Exception:
        return ""


def _filename_for(url: str, content_type: str) -> str:
    """
    Synthetic filename whose extension picks the parser downstream.

    URL path wins over Content-Type: servers mislabel far more often than a
    ".pdf" suffix lies, and picking the wrong parser is a silent quality
    failure (a PDF read as HTML yields junk, not an error).
    """
    path = urlparse(url).path.lower()
    if path.endswith(".pdf"):
        return "page.pdf"
    if path.endswith(".md"):
        return "page.md"
    if path.endswith((".txt", ".text")):
        return "page.txt"
    if "application/pdf" in content_type:
        return "page.pdf"
    if "text/plain" in content_type:
        return "page.txt"
    return "page.html"


async def _stream_fetch(
    url: str, cfg: ScraperConfig, *, max_bytes: Optional[int] = None,
) -> Tuple[bytes, str, str, int]:
    """
    GET `url` following redirects by hand, returning
    (raw_body, final_url, content_type, status_code).

    Shared by the httpx provider and the flipbook resolver so both get the
    same SSRF-safe redirect handling and size guard.
    """
    import httpx

    current = validate_url(url, allow_private_hosts=cfg.allow_private_hosts)
    limit = max_bytes if max_bytes is not None else cfg.max_bytes

    # Redirects are followed BY HAND. httpx's follow_redirects would chase a
    # 302 into private address space without re-validating, which is the
    # standard way an SSRF guard gets bypassed.
    try:
        async with httpx.AsyncClient(
            timeout=cfg.timeout_s,
            follow_redirects=False,
            headers={"User-Agent": cfg.user_agent},
        ) as client:
            for _ in range(cfg.max_redirects + 1):
                async with client.stream("GET", current) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise ScrapeError("Redirect without a destination.",
                                              reason="bad_redirect")
                        current = validate_url(
                            urljoin(current, location),
                            allow_private_hosts=cfg.allow_private_hosts,
                        )
                        continue

                    if response.status_code >= 400:
                        raise ScrapeError(
                            f"URL returned {response.status_code}.",
                            reason="http_error",
                            # 404 on THEIR url is a bad request to us, not our failure
                            status_hint=400,
                        )

                    # Read incrementally so an enormous body is abandoned early
                    # rather than buffered in full and then rejected.
                    chunks, total = [], 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > limit:
                            raise ScrapeError(
                                f"Page is larger than {limit // 1024 // 1024} MB.",
                                reason="too_large",
                            )
                        chunks.append(chunk)

                    raw = b"".join(chunks)
                    if not raw:
                        raise ScrapeError("URL returned an empty response.",
                                          reason="empty", status_hint=422)

                    return raw, current, response.headers.get("content-type", ""), response.status_code

            raise ScrapeError(f"Too many redirects (>{cfg.max_redirects}).",
                              reason="too_many_redirects")

    except ScrapeError:
        raise
    except httpx.TimeoutException as e:
        raise ScrapeError("Timed out fetching the URL.",
                          reason="timeout", status_hint=408) from e
    except httpx.RequestError as e:
        raise ScrapeError(f"Could not reach the URL: {e}",
                          reason="unreachable") from e


@register("httpx")
async def _fetch_httpx(url: str, cfg: ScraperConfig) -> FetchedPage:
    raw, current, content_type, status_code = await _stream_fetch(url, cfg)

    filename = _filename_for(current, content_type)
    title = (
        _extract_title(raw) if filename == "page.html" else ""
    ) or (urlparse(current).hostname or current)

    page = FetchedPage(
        raw=raw,
        final_url=current,
        content_type=content_type,
        filename=filename,
        title=title[:200],
        status_code=status_code,
    )

    # FlipHTML5 shells are near-empty HTML whose real content lives in static
    # assets referenced from the page's own JS — recover that instead of
    # indexing nothing. Kept out of the hot path: only run on HTML, and only
    # when the shell actually looks like a flipbook.
    if filename == "page.html":
        from app.orchestra.ai.ingestion.scraper.flipbook import detect_flipbook, resolve_flipbook
        if detect_flipbook(raw):
            resolved = await resolve_flipbook(current, cfg)
            if resolved is not None:
                logger.debug("scraper.flipbook.resolved", url=url,
                             kind=resolved.filename, title=resolved.title)
                return resolved

    return page
