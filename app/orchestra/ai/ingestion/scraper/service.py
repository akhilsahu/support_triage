"""
Unified Scraper Service — single source of truth for URL scraping, quality assessment,
smart quick-to-deep fallback, and raw snapshot persistence.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse
from uuid import UUID

import aiofiles
import structlog
from bs4 import BeautifulSoup

from app.orchestra.ai.ingestion.scraper.base import FetchedPage, ScrapeError
from app.orchestra.ai.ingestion.cancellation import settle_write
from app.orchestra.ai.ingestion.scraper.quality import ExtractionQuality, assess_extraction
from app.orchestra.ai.ingestion.scraper.registry import fetch_url
from app.orchestra.ai.ingestion.scraper.asset_extractor import (
    _safe_resolve_url,
    extract_markdown_assets,
    extract_page_assets,
    merge_page_assets,
)

logger = structlog.get_logger(__name__)

# Domains known to require heavy client-side JavaScript rendering or aggressive anti-bot handling
_KNOWN_DYNAMIC_DOMAINS = (
    "amazon.",
    "flipkart.",
    "walmart.",
    "target.",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "instagram.com",
    "threads.net",
    "facebook.com",
    "reddit.com",
)


def is_known_dynamic_domain(domain: str) -> bool:
    """Check if the given domain belongs to known JS-rendered or bot-protected sites."""
    lowered = domain.lower().strip()
    return any(d in lowered for d in _KNOWN_DYNAMIC_DOMAINS)


def compute_page_slug(url: str) -> str:
    """
    Derives a clean, readable filesystem slug from the URL path.
    Root URLs (e.g. https://amazon.in/) map to 'home'.
    Specific paths (e.g. /about or /dp/B08N5WRWNW) map to 'about' or 'dp_B08N5WRWNW'.
    """
    try:
        parsed = urlparse(url)
        path = (parsed.path or "").strip("/")
        if not path:
            return "home"
        slug = re.sub(r"[^a-zA-Z0-9_-]", "_", path)
        slug = re.sub(r"_+", "_", slug).strip("_")
        return slug[:60] if slug else "home"
    except Exception:
        return "home"


async def persist_raw_page_snapshot(
    *,
    space_id: UUID,
    item_id: UUID,
    url: str,
    domain: str,
    raw_bytes: bytes,
    extension: str = "html",
    suffix: str = "",
) -> Optional[str]:
    """
    Persists raw page bytes to disk under:
    uploads/links/<space_id>/<websitebase>/<item_id>/<page_name>.html

    Guarantees non-overlapping filenames:
    e.g. home.html -> home_1.html -> home_2.html if a file already exists.
    """
    if not raw_bytes:
        return None
    try:
        safe_domain = re.sub(r"[^a-zA-Z0-9.-]", "_", domain).strip("._") or "unknown_domain"
        target_dir = Path("uploads") / "links" / str(space_id) / safe_domain / str(item_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        base_slug = compute_page_slug(url)
        if suffix:
            base_slug = f"{base_slug}_{suffix}"

        candidate_file = target_dir / f"{base_slug}.{extension}"
        counter = 1
        while candidate_file.exists():
            candidate_file = target_dir / f"{base_slug}_{counter}.{extension}"
            counter += 1

        async with aiofiles.open(candidate_file, "wb") as f:
            await f.write(raw_bytes)

        logger.info(
            f"Persisted raw snapshot to '{candidate_file}' "
            f"({len(raw_bytes)} bytes, space={space_id}, item={item_id})"
        )
        return str(candidate_file)
    except Exception as err:
        logger.warning(
            f"Failed to persist raw snapshot for '{url}' (space={space_id}, item={item_id}): {err}",
            exc_info=True,
        )
        return None


@dataclass
class SmartScrapeResult:
    clean_text: str
    title: str
    page_assets: Dict[str, Any] = field(default_factory=dict)
    provenance: str = "scraper_quick"
    mode_used: str = "quick"
    quality: Optional[ExtractionQuality] = None
    raw_bytes: bytes = b""
    final_url: str = ""
    domain: str = ""
    filename: str = "page.html"


async def smart_scrape_url(
    url: str,
    *,
    space_id: Optional[UUID] = None,
    item_id: Optional[UUID] = None,
    force_deep: bool = False,
) -> SmartScrapeResult:
    """
    Fetches a URL and processes it with unified quality assessment and automatic quick-to-deep fallback:
    1. Quick scrape via httpx (unless force_deep is requested).
    2. HTML tag cleaning, markdown anchor link preservation.
    3. Asset discovery (favicon, logo, preview images, downloadable resources).
    4. Evaluates extraction quality via assess_extraction (bot challenges, text-to-HTML ratio, boilerplate).
    5. If quality is poor/questionable, SPA shell detected, or domain is known-dynamic:
       Automatically escalates to deep scrape (Firecrawl) for full client-side rendered DOM.
    6. Persists raw snapshot(s) under uploads/links/<space_id>/<domain>/<item_id>/ if identifiers provided.
    """
    started = time.monotonic()
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = f"https://{target_url}"

    domain = urlparse(target_url).netloc.replace("www.", "").strip() or target_url
    scrape_logger = logger.bind(
        space_id=str(space_id) if space_id else None,
        source_id=str(item_id) if item_id else None,
    )
    scrape_logger.info("scraper.started", mode="deep" if force_deep else "quick")
    title = domain
    clean_text = ""
    page_assets: Dict[str, Any] = {
        "favicon_url": None,
        "preview_image_url": None,
        "logo_url": None,
        "description": None,
        "images": [],
        "documents": [],
    }
    provenance = "scraper_quick"
    mode_used = "quick"
    quality: Optional[ExtractionQuality] = None
    raw_bytes = b""
    final_url = target_url
    filename = 'page.html'

    # 1. Quick scrape attempt
    page: Optional[FetchedPage] = None
    if not force_deep:
        try:
            page = await fetch_url(target_url, mode="quick")
            raw_bytes = page.raw
            filename = page.filename or filename
            final_url = page.final_url or target_url
            if page.title:
                title = page.title.strip()
            if page.raw:
                # Save quick snapshot
                if space_id and item_id:
                    raw_path = await settle_write(persist_raw_page_snapshot(
                        space_id=space_id,
                        item_id=item_id,
                        url=target_url,
                        domain=domain,
                        raw_bytes=page.raw,
                        extension="html",
                    ))
                    if raw_path:
                        page_assets["raw_html_path"] = raw_path

                # Extract brand assets
                extracted_assets = extract_page_assets(page.raw, final_url)
                page_assets.update(extracted_assets)

                # Parse and clean HTML
                soup = BeautifulSoup(page.raw, "html.parser")
                if (not title or title == domain) and soup.title and soup.title.string:
                    title = soup.title.string.strip()

                from app.orchestra.ai.ingestion.parsers.html_parser import clean_html_content
                soup = clean_html_content(soup)

                # Preserve anchor links in markdown format [anchor](url) so links are grounded
                for a_tag in soup.find_all("a", href=True):
                    if not a_tag.parent:
                        continue
                    href = a_tag.get("href")
                    resolved = _safe_resolve_url(final_url, href)
                    anchor_text = " ".join(a_tag.get_text(separator=" ", strip=True).split())
                    if resolved:
                        if anchor_text:
                            a_tag.replace_with(f" [{anchor_text}]({resolved}) ")
                        else:
                            a_tag.replace_with(f" {resolved} ")

                clean_text = soup.get_text(separator=" ", strip=True)
                quality = assess_extraction(clean_text, raw_bytes_len=len(page.raw))
        except Exception as quick_err:
            scrape_logger.warning("scraper.quick_failed", error_type=type(quick_err).__name__)
            clean_text = ""

    # 2. Determine if deep scraping fallback is required
    is_dynamic = is_known_dynamic_domain(domain)
    needs_deep = force_deep or page is None or (
        quality is not None and (
            quality.rating in ("poor", "questionable")
            or "unhydrated_shell" in quality.reasons
            or "bot_detection_challenge" in quality.reasons
            or "navigation_dominant" in quality.reasons
        )
    ) or len(clean_text) < 350 or len(clean_text.split()) < 40 or is_dynamic

    if needs_deep:
        escalation_reasons = []
        if force_deep:
            escalation_reasons.append("forced_deep")
        elif page is None:
            escalation_reasons.append("quick_fetch_failed")
        if is_dynamic:
            escalation_reasons.append("known_dynamic_domain")
        if quality:
            escalation_reasons.extend(quality.reasons)
        if len(clean_text) < 350:
            escalation_reasons.append("sparse_text")
        if len(clean_text.split()) < 40:
            escalation_reasons.append("too_few_words")

        scrape_logger.info(
            "scraper.deep_fallback", from_mode="quick" if not force_deep else None,
            to_mode="deep", reasons=escalation_reasons,
            quick_rating=quality.rating if quality else None,
            quick_score=quality.score if quality else None,
            characters=len(clean_text), elapsed_ms=int((time.monotonic() - started) * 1000),
        )

        try:
            deep_page = await fetch_url(target_url, mode="deep")
            if deep_page.title and (not title or title == domain):
                title = deep_page.title.strip()
            if deep_page.raw:
                deep_text = deep_page.raw.decode("utf-8", errors="ignore").strip()
                if len(deep_text) >= 30:
                    clean_text = deep_text
                    provenance = "scraper_deep_existing"
                    mode_used = "deep"
                    raw_bytes = deep_page.raw
                    filename = deep_page.filename or 'page.md'
                    final_url = deep_page.final_url or final_url

                    # Re-assess quality on deep markdown text
                    quality = assess_extraction(clean_text, raw_bytes_len=len(deep_page.raw))

                    # Persist deep snapshot
                    if space_id and item_id:
                        deep_ext = "md" if (deep_page.filename or "").endswith(".md") else "html"
                        deep_path = await settle_write(persist_raw_page_snapshot(
                            space_id=space_id,
                            item_id=item_id,
                            url=target_url,
                            domain=domain,
                            raw_bytes=deep_page.raw,
                            extension=deep_ext,
                            suffix="deep",
                        ))
                        if deep_path:
                            page_assets["raw_deep_path"] = deep_path

                    # Preserve exact associations from the rendered page, retaining quick assets.
                    if (deep_page.filename or "").endswith(".md"):
                        deep_assets = extract_markdown_assets(deep_text, final_url)
                    else:
                        deep_assets = extract_page_assets(deep_page.raw, final_url)
                    page_assets = merge_page_assets(page_assets, deep_assets)
                    if not page_assets.get("preview_image_url") and page_assets["images"]:
                        page_assets["preview_image_url"] = page_assets["images"][0]["url"]
        except Exception as deep_err:
            scrape_logger.warning("scraper.deep_failed", error_type=type(deep_err).__name__)

    # 3. Fallback to meta description if clean text is still under 30 characters
    if len(clean_text) < 30 and page_assets.get("description"):
        meta_desc = page_assets["description"].strip()
        if len(meta_desc) >= 30:
            clean_text = meta_desc

    scrape_logger.info(
        "scraper.completed", mode=mode_used, deep_attempted=needs_deep,
        characters=len(clean_text), quality=quality.rating if quality else None,
        elapsed_ms=int((time.monotonic() - started) * 1000),
    )
    return SmartScrapeResult(
        clean_text=clean_text,
        title=title,
        page_assets=page_assets,
        provenance=provenance,
        mode_used=mode_used,
        quality=quality,
        raw_bytes=raw_bytes,
        final_url=final_url,
        domain=domain,
        filename=filename,
    )
