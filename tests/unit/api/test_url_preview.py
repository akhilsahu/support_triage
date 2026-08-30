from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import documents
from app.orchestra.ai.ingestion.scraper.base import FetchedPage
from app.orchestra.ai.ingestion.scraper.cache import (
    load_preview,
    preview_token_mode,
    store_preview,
)
from app.orchestra.ai.ingestion.scraper.limits import (
    DeepPreviewLease,
    DeepPreviewLimitError,
    _process_capacity,
)


def _page(*, mode="quick", provider="httpx"):
    return FetchedPage(
        raw=b"Useful product details. " * 30,
        final_url="https://example.com",
        content_type="text/markdown",
        filename="page.md",
        title="Cards",
        status_code=200,
        provider=provider,
        mode=mode,
    )


def test_preview_cache_persists_provenance_and_enforces_tenant(tmp_path, monkeypatch):
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.cache.PREVIEW_DIR", tmp_path)
    token = store_preview("space-a", _page(mode="deep", provider="firecrawl"))
    assert token.startswith("d")
    assert preview_token_mode(token) == "deep"

    restored = load_preview(token, "space-a")
    assert restored is not None
    assert (restored.mode, restored.provider) == ("deep", "firecrawl")
    assert load_preview(token, "space-b") is None


def test_quick_and_legacy_tokens_infer_quick_mode(tmp_path, monkeypatch):
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.cache.PREVIEW_DIR", tmp_path)
    token = store_preview("space", _page())
    assert token.startswith("q")
    assert preview_token_mode(token) == "quick"
    assert preview_token_mode("d" + "a" * 31) == "quick"  # old 32-char token


@pytest.mark.anyio
async def test_preview_without_mode_uses_quick_and_returns_quality(monkeypatch):
    calls = []

    async def fake_fetch(url, *, mode):
        calls.append((url, mode))
        return _page()

    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.fetch_url", fake_fetch)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.store_preview", lambda *_: "token")
    monkeypatch.setattr(
        "app.orchestra.ai.ingestion.ingestion.IngestionService.parse",
        lambda self, raw, filename: SimpleNamespace(
            full_text=raw.decode(), page_count=1
        ),
    )

    result = await documents.rag_preview_url(
        documents.PreviewUrlRequest(url="https://example.com"),
        org=SimpleNamespace(id="space-a"),
    )

    assert calls == [("https://example.com", "quick")]
    assert result.mode == "quick"
    assert result.provider == "httpx"
    assert result.quality.rating in {"good", "questionable", "poor"}


@pytest.mark.anyio
async def test_deep_preview_uses_lease_and_returns_provenance(monkeypatch):
    events = []

    class FakeLease:
        def __init__(self, **kwargs):
            events.append(("lease", kwargs))

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    async def fake_fetch(url, *, mode):
        events.append(("fetch", mode))
        return _page(mode="deep", provider="firecrawl")

    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.DeepPreviewLease", FakeLease)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.fetch_url", fake_fetch)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.store_preview", lambda *_: "token")
    monkeypatch.setattr(
        "app.orchestra.ai.ingestion.ingestion.IngestionService.parse",
        lambda self, raw, filename: SimpleNamespace(full_text=raw.decode(), page_count=1),
    )

    result = await documents.rag_preview_url(
        documents.PreviewUrlRequest(url="https://example.com", mode="deep"),
        org=SimpleNamespace(id="space-a"),
    )

    assert events == [
        ("lease", {"space_id": "space-a", "user_id": "space-a"}),
        ("fetch", "deep"),
    ]
    assert (result.mode, result.provider) == ("deep", "firecrawl")


class _FakeRedis:
    def __init__(self, *, acquired=True):
        self.acquired = acquired
        self.released = False

    async def set(self, *args, **kwargs):
        return self.acquired

    async def eval(self, *args):
        self.released = True


@pytest.mark.anyio
async def test_deep_preview_lease_rejects_quota(monkeypatch):
    _process_capacity._active = 0
    increments = []

    async def increment(key, amount=1):
        increments.append(amount)
        return 51 if amount == 1 else 50

    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.limits.redis_client.increment", increment)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_MAX_REQUESTS_PER_SPACE_PER_DAY", 50)

    with pytest.raises(DeepPreviewLimitError) as caught:
        async with DeepPreviewLease(space_id="space", user_id="user"):
            pass
    assert caught.value.reason == "deep_quota_exceeded"
    assert caught.value.status_hint == 429
    assert increments == [1, -1]
    assert _process_capacity._active == 0


@pytest.mark.anyio
async def test_deep_preview_lease_rejects_busy_and_refunds(monkeypatch):
    _process_capacity._active = 0
    increments = []
    fake = _FakeRedis(acquired=False)

    async def increment(key, amount=1):
        increments.append(amount)
        return 2

    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.limits.redis_client.increment", increment)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.limits.redis_client.redis", fake)

    with pytest.raises(DeepPreviewLimitError) as caught:
        async with DeepPreviewLease(space_id="space", user_id="user"):
            pass
    assert caught.value.reason == "deep_busy"
    assert caught.value.status_hint == 429
    assert increments == [1, -1]
    assert _process_capacity._active == 0


@pytest.mark.anyio
async def test_process_capacity_rejects_excess_and_releases_on_body_error(monkeypatch):
    _process_capacity._active = 0
    fake = _FakeRedis()

    async def increment(key, amount=1):
        return 1

    async def expire(key, seconds):
        return True

    monkeypatch.setattr("app.config.settings.FIRECRAWL_MAX_CONCURRENT_REQUESTS", 1)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.limits.redis_client.increment", increment)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.limits.redis_client.expire", expire)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.limits.redis_client.redis", fake)

    first = DeepPreviewLease(space_id="space-1", user_id="user-1")
    await first.__aenter__()
    with pytest.raises(DeepPreviewLimitError) as caught:
        async with DeepPreviewLease(space_id="space-2", user_id="user-2"):
            pass
    assert caught.value.reason == "deep_busy"

    await first.__aexit__(RuntimeError, RuntimeError("body failed"), None)
    async with DeepPreviewLease(space_id="space-2", user_id="user-2"):
        pass
    assert _process_capacity._active == 0


@pytest.mark.anyio
async def test_valid_deep_token_is_redeemed_without_fetch(tmp_path, monkeypatch):
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.cache.PREVIEW_DIR", tmp_path)
    token = store_preview("space", _page(mode="deep", provider="firecrawl"))

    async def forbidden_fetch(*args, **kwargs):
        raise AssertionError("valid preview token must not trigger a fetch")

    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.fetch_url", forbidden_fetch)
    page = load_preview(token, "space")
    assert page is not None
    assert page.raw == _page(mode="deep", provider="firecrawl").raw


@pytest.mark.anyio
async def test_valid_deep_token_reaches_ingestion_job_without_fetch(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.cache.PREVIEW_DIR", tmp_path / "previews")
    token = store_preview("space", _page(mode="deep", provider="firecrawl"))

    async def forbidden_fetch(*args, **kwargs):
        raise AssertionError("valid deep token must not trigger a fetch")

    queued = []
    runner = SimpleNamespace(enqueue=lambda task, **kwargs: queued.append((task, kwargs)))
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.fetch_url", forbidden_fetch)
    monkeypatch.setattr("app.orchestra.ai.ingestion.jobs.get_job_runner", lambda: runner)

    class FakeDb:
        def add(self, row):
            self.row = row

        async def commit(self):
            pass

        async def refresh(self, row):
            if row.id is None:
                row.id = __import__("uuid").uuid4()

    result = await documents.rag_ingest_url(
        documents.IngestUrlRequest(
            url="https://example.com",
            preview_token=token,
            preview_mode="deep",
        ),
        x_contextual_enrichment=None,
        org=SimpleNamespace(id="space", display_name="Space"),
        db=FakeDb(),
    )

    assert result.status == "queued"
    assert len(queued) == 1
    assert queued[0][0] == "ingest_document"
    assert queued[0][1]["source_url"] == "https://example.com"
    assert load_preview(token, "space") is None


@pytest.mark.anyio
async def test_expired_deep_token_does_not_refetch_quick(monkeypatch):
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.load_preview", lambda *_: None)

    async def forbidden_fetch(*args, **kwargs):
        raise AssertionError("expired deep token must not trigger a fetch")

    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.fetch_url", forbidden_fetch)

    with pytest.raises(HTTPException) as caught:
        await documents.rag_ingest_url(
            documents.IngestUrlRequest(
                url="https://example.com",
                preview_token="d" + "a" * 32,
                preview_mode="quick",
            ),
            org=SimpleNamespace(id="space"),
            db=SimpleNamespace(),
        )
    assert caught.value.status_code == 409
    assert caught.value.detail == "Deep Preview expired. Generate it again before adding."
