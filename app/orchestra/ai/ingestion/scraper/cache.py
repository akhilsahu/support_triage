"""
Short-lived store for a fetched page, bridging preview → confirm.

Why this exists: preview and confirm are two requests. Re-fetching on confirm
would be wasteful, but worse, it would be *unsound* — a page can change between
the two, so the user could approve one thing and index another. Holding the
exact bytes means what was previewed is what gets ingested.

Entries are disposable by construction (a re-fetch always reproduces them), so
losing them to a restart or a sweep is harmless — the caller just re-fetches.

Layout, one pair per preview:
    <tmp>/support247_previews/<token>.bin     raw bytes
    <tmp>/support247_previews/<token>.json    metadata + owning space
"""

from __future__ import annotations

import json
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

import structlog

from app.orchestra.ai.ingestion.scraper.base import FetchedPage, ScrapeMode

logger = structlog.get_logger()

PREVIEW_DIR = Path(tempfile.gettempdir()) / "support247_previews"
# Long enough to read an extract and decide; short enough that abandoned
# previews (the common case — people paste, look, and close) don't accumulate.
PREVIEW_TTL_SECONDS = 30 * 60


def _paths(token: str) -> tuple[Path, Path]:
    # Tokens are generated here (mode prefix + uuid4 hex), never derived from
    # client input. They are still validated on load before becoming paths.
    return PREVIEW_DIR / f"{token}.bin", PREVIEW_DIR / f"{token}.json"


def store_preview(space_id: str, page: FetchedPage) -> str:
    """Persist a fetched page and return its redemption token."""
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    # The mode prefix survives expiry, unlike the cached metadata. This lets
    # ingestion refuse to replace an expired Deep Preview with a Quick fetch.
    token = ("d" if page.mode == "deep" else "q") + uuid.uuid4().hex
    bin_path, meta_path = _paths(token)

    bin_path.write_bytes(page.raw)
    meta_path.write_text(json.dumps({
        "space_id":     space_id,     # redemption is checked against this
        "final_url":    page.final_url,
        "content_type": page.content_type,
        "filename":     page.filename,
        "title":        page.title,
        "status_code":  page.status_code,
        "provider":     page.provider,
        "mode":         page.mode,
        "created_at":   time.time(),
    }))
    return token


def preview_token_mode(token: str) -> ScrapeMode:
    """Infer provenance without reading cache metadata.

    New tokens are a one-character prefix plus a 32-character UUID hex value.
    Older unprefixed UUID tokens remain Quick Preview tokens for compatibility.
    Invalid/missing tokens are also treated as quick; callers still validate
    them through ``load_preview`` before redemption.
    """
    if len(token) == 33 and token[0] in {"d", "q"} and token[1:].isalnum():
        return "deep" if token[0] == "d" else "quick"
    return "quick"


def load_preview(token: str, space_id: str) -> Optional[FetchedPage]:
    """
    Rebuild a previously previewed page, or None if it's missing, expired, or
    belongs to another space.

    The space check is the important one: without it a token leaked or guessed
    from one tenant could be redeemed by another, ingesting a page they never
    fetched into their KB.
    """
    if not token or not token.isalnum():
        return None

    bin_path, meta_path = _paths(token)
    if not (bin_path.exists() and meta_path.exists()):
        return None

    try:
        meta = json.loads(meta_path.read_text())
    except Exception:
        logger.warning("scraper.preview.unreadable_meta", token=token)
        return None

    if meta.get("space_id") != space_id:
        logger.warning("scraper.preview.space_mismatch", token=token)
        return None

    if time.time() - float(meta.get("created_at", 0)) > PREVIEW_TTL_SECONDS:
        discard_preview(token)
        return None

    return FetchedPage(
        raw=bin_path.read_bytes(),
        final_url=meta.get("final_url", ""),
        content_type=meta.get("content_type", ""),
        filename=meta.get("filename", "page.html"),
        title=meta.get("title", ""),
        status_code=int(meta.get("status_code", 200)),
        provider=meta.get("provider", ""),
        mode=meta.get("mode", "quick"),
    )


def discard_preview(token: str) -> None:
    """Drop a preview once redeemed (or when found expired). Never raises."""
    for p in _paths(token):
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


def sweep_previews() -> int:
    """Delete expired previews. Safe to call repeatedly; returns how many went."""
    if not PREVIEW_DIR.exists():
        return 0
    now, removed = time.time(), 0
    for meta_path in PREVIEW_DIR.glob("*.json"):
        try:
            meta = json.loads(meta_path.read_text())
            expired = now - float(meta.get("created_at", 0)) > PREVIEW_TTL_SECONDS
        except Exception:
            expired = True   # unparseable → not redeemable, so it's litter
        if expired:
            discard_preview(meta_path.stem)
            removed += 1
    if removed:
        logger.info("scraper.preview.swept", removed=removed)
    return removed
