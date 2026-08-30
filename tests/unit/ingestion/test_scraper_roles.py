from dataclasses import replace

import pytest

from app.orchestra.ai.ingestion.scraper.base import FetchedPage, get_scraper_config
from app.orchestra.ai.ingestion.scraper.registry import fetch_url, register


def test_quick_provider_prefers_new_setting(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "SCRAPER_PROVIDER", "legacy")
    monkeypatch.setattr(settings, "SCRAPER_QUICK_PROVIDER", "httpx")

    assert get_scraper_config("quick").provider == "httpx"


def test_quick_provider_falls_back_to_legacy_setting(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "SCRAPER_PROVIDER", "legacy")
    monkeypatch.setattr(settings, "SCRAPER_QUICK_PROVIDER", "")

    assert get_scraper_config("quick").provider == "legacy"


def test_deep_provider_is_independent(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "SCRAPER_DEEP_PROVIDER", "firecrawl")

    assert get_scraper_config("deep").provider == "firecrawl"


@pytest.mark.anyio
async def test_fetch_url_records_selected_provider_and_mode():
    @register("contract-test")
    async def fake(url, cfg):
        return FetchedPage(
            raw=b"body",
            final_url=url,
            content_type="text/plain",
            filename="page.txt",
            title="Page",
            status_code=200,
            provider="",
            mode="quick",
        )

    cfg = replace(get_scraper_config("deep"), provider="contract-test")
    page = await fetch_url("https://example.com", cfg, mode="deep")

    assert page.provider == "contract-test"
    assert page.mode == "deep"
