"""Firecrawl-backed extraction for explicitly requested Deep Previews.

The adapter contains every vendor-specific detail and translates successful
responses back into the provider-neutral ``FetchedPage`` contract.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote, urljoin, urlsplit

import structlog

import httpx

from app.config import settings
from app.orchestra.ai.ingestion.scraper.base import FetchedPage, ScrapeError
from app.orchestra.ai.ingestion.scraper.registry import register
from app.orchestra.ai.ingestion.scraper.safety import validate_url


# Tests replace this with MockTransport. Production leaves it unset so httpx
# uses its normal transport without exposing a client or vendor type upstream.
_transport: httpx.AsyncBaseTransport | None = None


def _provider_error(response: httpx.Response) -> ScrapeError | None:
    if response.status_code == 429:
        return ScrapeError(
            "Deep Preview provider is rate limited.",
            reason="provider_rate_limited",
            status_hint=429,
        )
    if response.status_code in (401, 403):
        return ScrapeError(
            "Deep Preview is not configured correctly.",
            reason="deep_provider_unconfigured",
            status_hint=503,
        )
    if response.status_code >= 500:
        return ScrapeError(
            "Deep Preview provider is unavailable.",
            reason="provider_unavailable",
            status_hint=503,
        )
    if response.status_code >= 400:
        return ScrapeError(
            "The provider could not access this page.",
            reason="provider_blocked",
            status_hint=422,
        )
    return None


def _response_data(response: httpx.Response) -> tuple[str, dict[str, Any], list[str]]:
    try:
        payload = response.json()
        if payload.get("success") is False:
            raise ValueError("provider reported failure")
        data = payload.get("data", {})
        markdown = data.get("markdown", "")
        metadata = data.get("metadata", {})
        if not isinstance(markdown, str) or not isinstance(metadata, dict):
            raise TypeError("unexpected Firecrawl response fields")
        links = data.get("links", [])
        if not isinstance(links, list) or any(not isinstance(link, str) for link in links):
            raise TypeError("unexpected Firecrawl links")
        return markdown.strip(), metadata, links
    except (TypeError, ValueError, AttributeError) as exc:
        raise ScrapeError(
            "Deep Preview returned an invalid response.",
            reason="provider_bad_response",
            status_hint=502,
        ) from exc


async def fetch_firecrawl(url: str, cfg: dict) -> FetchedPage:
    """Render and extract one public URL through Firecrawl."""
    safe_url = validate_url(url, allow_private_hosts=cfg['allow_private_hosts'])
    api_key = settings.FIRECRAWL_API_KEY.strip()
    if not api_key:
        raise ScrapeError(
            "Deep Preview is not configured.",
            reason="deep_provider_unconfigured",
            status_hint=503,
        )

    endpoint = settings.FIRECRAWL_BASE_URL.rstrip("/") + "/v1/scrape"
    try:
        async with httpx.AsyncClient(
            timeout=cfg['timeout_s'],
            transport=_transport,
        ) as client:
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "url": safe_url,
                    "formats": ["markdown", "links"],
                    "onlyMainContent": settings.FIRECRAWL_ONLY_MAIN_CONTENT,
                    "timeout": max(1, min(300000, int(cfg['timeout_s'] * 1000) - 1000)),
                },
            )
    except httpx.TimeoutException as exc:
        raise ScrapeError(
            "Deep Preview timed out.",
            reason="provider_timeout",
            status_hint=408,
        ) from exc
    except httpx.RequestError as exc:
        raise ScrapeError(
            "Deep Preview provider is unavailable.",
            reason="provider_unavailable",
            status_hint=503,
        ) from exc

    structlog.get_logger().info("firecrawl_response", status=response.status_code)

    error = _provider_error(response)
    if error is not None:
        raise error

    markdown, metadata, links = _response_data(response)
    raw = markdown.encode("utf-8")
    if not raw:
        raise ScrapeError(
            "Deep Preview found no extractable content.",
            reason="provider_bad_response",
            status_hint=422,
        )
    if len(raw) > cfg['max_bytes']:
        raise ScrapeError(
            "Deep Preview content is too large.",
            reason="too_large",
            status_hint=413,
        )

    final_url = validate_url(
        metadata.get("sourceURL") or safe_url,
        allow_private_hosts=cfg['allow_private_hosts'],
    )
    try:
        status_code = int(metadata.get("statusCode") or 200)
    except (TypeError, ValueError) as exc:
        raise ScrapeError(
            "Deep Preview returned an invalid response.",
            reason="provider_bad_response",
            status_hint=502,
        ) from exc

    if status_code >= 400:
        raise ScrapeError(
            "The provider could not access this page.",
            reason="provider_blocked", status_hint=422,
        )

    # Retain destinations omitted from Markdown, including image-only anchors.
    # References travel through the existing cache/index contract; no crawl occurs.
    destinations = []
    seen = set()
    for link in links:
        try:
            resolved = urljoin(final_url, link.strip())
            parsed = urlsplit(resolved)
            if (not link.strip() or parsed.scheme not in {"https", "http"}
                    or not parsed.hostname or parsed.username or parsed.password):
                continue
        except ValueError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        destination = quote(resolved, safe=":/?#@!$&'*+,;=%~_-.")
        destinations.append(f"- [Discovered page link]({destination})")
    if destinations:
        markdown += "\n\n## Links discovered on this page\n\n" + "\n".join(destinations)
    raw = markdown.encode("utf-8")
    if len(raw) > cfg['max_bytes']:
        raise ScrapeError("Deep Preview content is too large.", reason="too_large", status_hint=413)

    return FetchedPage(
        raw=raw,
        final_url=final_url,
        content_type="text/markdown; charset=utf-8",
        filename="page.md",
        title=str(metadata.get("title") or final_url)[:200],
        status_code=status_code,
    )


@register("firecrawl")
async def _fetch_firecrawl(url: str, cfg: dict) -> FetchedPage:
    return await fetch_firecrawl(url, cfg)
