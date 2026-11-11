from types import SimpleNamespace

import pytest

import app.orchestra.ai.ingestion.jobs  # noqa: F401 - initializes the job registry
from app.orchestra.ai.ingestion import orchestration
from app.orchestra.ai.ingestion import scraper


@pytest.mark.asyncio
async def test_url_fetch_keeps_content_type_filename(monkeypatch):
    async def fake_fetch_url(url: str, mode: str):
        assert url == "https://example.com"
        assert mode == "quick"
        return SimpleNamespace(raw=b"<html>Example</html>", filename="page.html")

    monkeypatch.setattr(scraper, "fetch_url", fake_fetch_url)

    raw, filename = await orchestration._fetch_url_content("https://example.com")

    assert raw == b"<html>Example</html>"
    assert filename == "page.html"
