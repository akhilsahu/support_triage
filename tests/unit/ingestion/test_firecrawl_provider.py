from dataclasses import replace
import json

import httpx
import pytest

from app.orchestra.ai.ingestion.scraper.base import ScrapeError, get_scraper_config


PUBLIC_URL = "https://93.184.216.34/page"


def _success_payload(**overrides):
    data = {
        "markdown": "# SBI Card ELITE\n\nEarn 5X reward points.",
        "metadata": {
            "title": "SBI Credit Cards",
            "sourceURL": PUBLIC_URL,
            "statusCode": 200,
        },
    }
    data.update(overrides)
    return {"success": True, "data": data}


@pytest.mark.anyio
async def test_firecrawl_returns_markdown_page_and_sends_expected_request(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://firecrawl.test/v1/scrape"
        assert request.headers["Authorization"] == "Bearer test-key"
        assert request.headers["content-type"] == "application/json"
        assert json.loads(request.content) == {
            "url": "https://93.184.216.34/page",
            "formats": ["markdown"],
            "onlyMainContent": True,
        }
        return httpx.Response(200, json=_success_payload())

    monkeypatch.setattr(firecrawl, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")
    monkeypatch.setattr("app.config.settings.FIRECRAWL_BASE_URL", "https://firecrawl.test/")

    page = await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert page.filename == "page.md"
    assert page.raw.startswith(b"# SBI Card ELITE")
    assert page.title == "SBI Credit Cards"
    assert page.final_url == PUBLIC_URL
    assert page.content_type == "text/markdown; charset=utf-8"
    assert page.status_code == 200


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status", "reason", "status_hint"),
    [
        (401, "deep_provider_unconfigured", 503),
        (403, "deep_provider_unconfigured", 503),
        (404, "provider_blocked", 422),
        (429, "provider_rate_limited", 429),
        (500, "provider_unavailable", 503),
    ],
)
async def test_firecrawl_maps_upstream_errors(
    monkeypatch, status, reason, status_hint
):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    transport = httpx.MockTransport(
        lambda request: httpx.Response(status, json={"error": "upstream"})
    )
    monkeypatch.setattr(firecrawl, "_transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert exc.value.reason == reason
    assert exc.value.status_hint == status_hint


@pytest.mark.anyio
async def test_firecrawl_rejects_blank_api_key_without_a_request(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    async def fail_if_called(request):
        raise AssertionError("provider must not be called without an API key")

    monkeypatch.setattr(firecrawl, "_transport", httpx.MockTransport(fail_if_called))
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "  ")

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert exc.value.reason == "deep_provider_unconfigured"
    assert exc.value.status_hint == 503


@pytest.mark.anyio
async def test_firecrawl_maps_timeout(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    monkeypatch.setattr(firecrawl, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert exc.value.reason == "provider_timeout"
    assert exc.value.status_hint == 408


@pytest.mark.anyio
async def test_firecrawl_rejects_malformed_json(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, content=b"not json")
    )
    monkeypatch.setattr(firecrawl, "_transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert exc.value.reason == "provider_bad_response"
    assert exc.value.status_hint == 502


@pytest.mark.anyio
async def test_firecrawl_rejects_empty_markdown(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=_success_payload(markdown="  "))
    )
    monkeypatch.setattr(firecrawl, "_transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert exc.value.reason == "provider_bad_response"
    assert exc.value.status_hint == 422


@pytest.mark.anyio
async def test_firecrawl_rejects_provider_reported_private_final_url(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    payload = _success_payload()
    payload["data"]["metadata"]["sourceURL"] = "http://127.0.0.1/admin"
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload)
    )
    monkeypatch.setattr(firecrawl, "_transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, get_scraper_config("deep"))

    assert exc.value.reason == "blocked_host"


@pytest.mark.anyio
async def test_firecrawl_rejects_markdown_over_max_bytes(monkeypatch):
    from app.orchestra.ai.ingestion.scraper import firecrawl

    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=_success_payload(markdown="large"))
    )
    monkeypatch.setattr(firecrawl, "_transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")
    cfg = replace(get_scraper_config("deep"), max_bytes=4)

    with pytest.raises(ScrapeError) as exc:
        await firecrawl.fetch_firecrawl(PUBLIC_URL, cfg)

    assert exc.value.reason == "too_large"
    assert exc.value.status_hint == 413
