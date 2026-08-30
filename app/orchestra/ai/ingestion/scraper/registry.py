"""
Scraper registry — pluggable fetch strategies.

A provider is `async (url, ScraperConfig) -> FetchedPage` registered by name.
Scraping is the part of ingestion most likely to need swapping — a static
fetch handles most pages, but JS-rendered apps need a headless browser, and
some sites need per-domain handling. To add one:

    from app.orchestra.ai.ingestion.scraper import register

    @register("headless")
    async def _fetch_headless(url, cfg):
        from playwright.async_api import async_playwright
        ...
        return FetchedPage(raw=html.encode(), final_url=..., ...)

Then set SCRAPER_PROVIDER=headless. Registering under an existing name replaces
it. Callers only ever call fetch_url(), so nothing downstream changes.

Unlike the reranker registry — where a failure degrades to "no reranking" and
the chat still works — a scrape failure has no useful fallback: there is no
page. So errors propagate as ScrapeError for the caller to surface, rather
than being swallowed into None.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Awaitable, Callable, Dict, List, Optional

import structlog

from app.orchestra.ai.ingestion.scraper.base import (
    FetchedPage,
    ScrapeMode,
    ScrapeError,
    ScraperConfig,
    get_scraper_config,
)

logger = structlog.get_logger()

ScraperFn = Callable[[str, ScraperConfig], Awaitable[FetchedPage]]

_REGISTRY: Dict[str, ScraperFn] = {}


def register(name: str) -> Callable[[ScraperFn], ScraperFn]:
    """Decorator: register a fetch strategy under `name` (case-insensitive)."""
    key = name.strip().lower()

    def _decorator(fn: ScraperFn) -> ScraperFn:
        _REGISTRY[key] = fn
        return fn

    return _decorator


def available_providers() -> List[str]:
    return sorted(_REGISTRY)


async def fetch_url(
    url: str,
    cfg: Optional[ScraperConfig] = None,
    *,
    mode: ScrapeMode = "quick",
) -> FetchedPage:
    """
    Fetch `url` with the configured provider.

    Raises ScrapeError on any failure — bad scheme, blocked host, timeout,
    HTTP error, oversized body. The caller maps it (the API layer uses
    ScrapeError.status_hint).
    """
    cfg = cfg or get_scraper_config(mode)

    if not cfg.provider:
        raise ScrapeError(
            "Deep Preview is not configured."
            if mode == "deep"
            else "Scraper is not configured.",
            reason="deep_provider_unconfigured"
            if mode == "deep"
            else "unknown_provider",
            status_hint=503,
        )

    fetcher = _REGISTRY.get(cfg.provider)
    if fetcher is None:
        raise ScrapeError(
            f"Unknown scraper provider '{cfg.provider}'.",
            reason="unknown_provider", status_hint=500,
        )

    page = await fetcher(url.strip(), cfg)
    page = replace(page, provider=cfg.provider, mode=mode)
    logger.info("scraper.fetched", provider=cfg.provider, mode=mode, url=url,
                final_url=page.final_url, status=page.status_code,
                bytes=page.size_bytes, content_type=page.content_type)
    return page
