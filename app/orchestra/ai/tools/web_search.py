"""Web Search Tools for AI agents and grounding services.

Provides search capabilities (e.g. Firecrawl search) isolated from page-scraping pipelines.
"""

from __future__ import annotations

import logging
from typing import Any, List, Dict, Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def search_web(
    query: str,
    limit: int = 3,
    timeout_s: float = 8.0,
    transport: Optional[httpx.AsyncBaseTransport] = None
) -> List[Dict[str, Any]]:
    """Search the web for grounding candidates.

    Returns a list of candidate dictionaries:
    [
        {"title": str, "url": str, "description": str},
        ...
    ]
    """
    api_key = settings.FIRECRAWL_API_KEY.strip()
    if not api_key:
        logger.warning("search_web: FIRECRAWL_API_KEY not configured, skipping search")
        return []

    endpoint = settings.FIRECRAWL_BASE_URL.rstrip("/") + "/v1/search"
    try:
        async with httpx.AsyncClient(timeout=timeout_s, transport=transport) as client:
            payload = {
                "query": query,
                "limit": limit,
                "scrapeOptions": {"formats": ["markdown"]}
            }
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            if response.status_code != 200:
                logger.warning(
                    f"search_web: provider returned status={response.status_code}: {response.text[:300]}"
                )
                return []

            payload_data = response.json()
            data = payload_data.get("data")
            if not isinstance(data, list):
                return []

            results: List[Dict[str, Any]] = []
            for item in data[:limit]:
                if isinstance(item, dict):
                    desc = str(item.get("description") or "").strip()
                    markdown = str(item.get("markdown") or "").strip()
                    snippet = markdown[:1000] if markdown else desc
                    results.append({
                        "title": str(item.get("title") or "").strip(),
                        "url": str(item.get("url") or "").strip(),
                        "description": desc,
                        "snippet": snippet,
                    })
            return results
    except Exception as exc:
        logger.warning(f"search_web: exception occurred: {exc}")
        return []

