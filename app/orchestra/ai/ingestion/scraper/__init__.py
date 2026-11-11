"""
Scraper package — fetching a user-supplied URL, isolated from everything else.

Kept separate because scraping is the least predictable part of ingestion:
sites change, block, redirect, rate-limit, or need a real browser. Confining
that to one package means those failures can be handled (and swapped) without
touching parsing, chunking, or the API layer.

    from app.orchestra.ai.ingestion.scraper import fetch_url, ScrapeError

    try:
        page = await fetch_url("https://example.com/faq")
    except ScrapeError as e:
        ...  # e.status_hint / e.reason / str(e)

Extend by registering another strategy (headless browser, per-domain handler)
— see registry.py. Config lives in SCRAPER_* settings.
"""

from app.orchestra.ai.ingestion.scraper.base import FetchedPage, ScrapeError
from app.orchestra.ai.config import get_scraper_config
from app.orchestra.ai.ingestion.scraper.registry import (
    register,
    fetch_url,
    available_providers,
)
from app.orchestra.ai.ingestion.scraper.safety import validate_url
from app.orchestra.ai.ingestion.scraper.cache import (
    store_preview,
    load_preview,
    discard_preview,
    sweep_previews,
    PREVIEW_TTL_SECONDS,
    preview_token_mode,
)
from app.orchestra.ai.ingestion.scraper.limits import (
    DeepPreviewLease,
    DeepPreviewLimitError,
)
from app.orchestra.ai.ingestion.scraper.service import (
    SmartScrapeResult,
    compute_page_slug,
    is_known_dynamic_domain,
    persist_raw_page_snapshot,
    smart_scrape_url,
)
# Import built-in providers so they self-register on package import.
from app.orchestra.ai.ingestion.scraper import providers  # noqa: F401
from app.orchestra.ai.ingestion.scraper import firecrawl  # noqa: F401

__all__ = [
    "FetchedPage",
    "ScrapeError",
    "get_scraper_config",
    "register",
    "fetch_url",
    "available_providers",
    "validate_url",
    "store_preview",
    "load_preview",
    "discard_preview",
    "sweep_previews",
    "PREVIEW_TTL_SECONDS",
    "preview_token_mode",
    "DeepPreviewLease",
    "DeepPreviewLimitError",
    "smart_scrape_url",
    "SmartScrapeResult",
    "persist_raw_page_snapshot",
    "compute_page_slug",
    "is_known_dynamic_domain",
]
