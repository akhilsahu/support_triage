# Firecrawl Deep Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-triggered, provider-pluggable Deep Preview that uses Firecrawl to extract clean content from JavaScript-heavy URLs while preserving the existing Quick Preview.

**Architecture:** Extend the existing scraper registry with quick/deep provider roles and a Firecrawl adapter that returns the existing `FetchedPage` contract. Parse, assess, cache, and ingest both preview modes through shared provider-neutral code; expose mode and quality through the existing endpoint and let the UI select the exact cached result to ingest.

**Tech Stack:** Python 3, FastAPI, Pydantic, httpx, Redis, pytest, React 18, TypeScript, Axios, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-firecrawl-deep-preview-design.md`

## Global Constraints

- Quick Preview remains the default and must not incur Firecrawl usage.
- Deep Preview runs only after an explicit user action.
- The API and UI must use provider-neutral contracts and must not import Firecrawl types.
- Use `httpx`; do not add the Firecrawl SDK.
- Default deep timeout is 15 seconds and default per-space quota is 50 requests per day.
- Never silently replace an expired Deep Preview with a Quick Preview fetch.
- Preserve tenant-bound, exact-byte preview-token ingestion.
- Run existing URL/SSRF validation before sending a URL to an external provider.
- Never log API keys or extracted page content.

---

## File Structure

**Create**

- `app/orchestra/ai/ingestion/scraper/firecrawl.py` — Firecrawl HTTP adapter and provider error mapping.
- `app/orchestra/ai/ingestion/scraper/quality.py` — deterministic extraction-quality scorer.
- `app/orchestra/ai/ingestion/scraper/limits.py` — Redis-backed Deep Preview quota and in-flight lock.
- `tests/unit/ingestion/test_scraper_roles.py` — config and registry role-selection tests.
- `tests/unit/ingestion/test_firecrawl_provider.py` — mocked Firecrawl adapter tests.
- `tests/unit/ingestion/test_scrape_quality.py` — quality-scoring fixtures and boundary tests.
- `tests/unit/api/test_url_preview.py` — preview API and preview-token ingestion tests.
- `ui/src/screens/KnowledgeBase.preview.test.tsx` — Quick/Deep UI behavior tests.
- `ui/src/test/setup.ts` — DOM test setup.

**Modify**

- `app/config.py` — quick/deep provider, Firecrawl, timeout, and quota settings.
- `app/orchestra/ai/ingestion/scraper/base.py` — role-aware configuration and page provenance.
- `app/orchestra/ai/ingestion/scraper/registry.py` — explicit provider dispatch.
- `app/orchestra/ai/ingestion/scraper/cache.py` — persist preview provenance.
- `app/orchestra/ai/ingestion/scraper/__init__.py` — register/export new modules.
- `app/api/v1/documents.py` — mode-aware preview, quality response, limits, and safe token redemption.
- `ui/src/api/client.ts` — preview request and response types.
- `ui/src/screens/KnowledgeBase.tsx` — dual preview state and selection UI.
- `ui/package.json` — UI test runner and dependencies.
- `.env.example` — documented deployment settings.

---

### Task 1: Provider Roles and Provenance Contracts

**Files:**
- Modify: `app/config.py`
- Modify: `app/orchestra/ai/ingestion/scraper/base.py`
- Modify: `app/orchestra/ai/ingestion/scraper/registry.py`
- Test: `tests/unit/ingestion/test_scraper_roles.py`

**Interfaces:**
- Produces: `ScrapeMode = Literal["quick", "deep"]`
- Produces: `get_scraper_config(mode: ScrapeMode = "quick") -> ScraperConfig`
- Produces: `fetch_url(url: str, cfg: ScraperConfig | None = None, *, mode: ScrapeMode = "quick") -> Awaitable[FetchedPage]`
- Produces: `FetchedPage.provider: str` and `FetchedPage.mode: ScrapeMode`
- Consumes: existing `register`, `validate_url`, and application `settings`.

- [ ] **Step 1: Write failing role-selection tests**

Create `tests/unit/ingestion/test_scraper_roles.py`:

```python
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
async def test_fetch_url_records_selected_provider_and_mode(monkeypatch):
    @register("contract-test")
    async def fake(url, cfg):
        return FetchedPage(
            raw=b"body", final_url=url, content_type="text/plain",
            filename="page.txt", title="Page", status_code=200,
            provider="", mode="quick",
        )

    cfg = replace(get_scraper_config("deep"), provider="contract-test")
    page = await fetch_url("https://example.com", cfg, mode="deep")
    assert page.provider == "contract-test"
    assert page.mode == "deep"
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `pytest tests/unit/ingestion/test_scraper_roles.py -v`

Expected: FAIL because the new settings, mode argument, and provenance fields do not exist.

- [ ] **Step 3: Add settings and role-aware contracts**

Add these settings near the existing scraper settings in `app/config.py`:

```python
SCRAPER_QUICK_PROVIDER: str = ""
SCRAPER_DEEP_PROVIDER: str = "firecrawl"
SCRAPER_DEEP_TIMEOUT_S: int = 15
FIRECRAWL_API_KEY: str = ""
FIRECRAWL_BASE_URL: str = "https://api.firecrawl.dev"
FIRECRAWL_MAX_REQUESTS_PER_SPACE_PER_DAY: int = 50
```

In `base.py`, add the exact mode type and immutable provenance defaults:

```python
from typing import Literal

ScrapeMode = Literal["quick", "deep"]

@dataclass(frozen=True)
class FetchedPage:
    raw: bytes
    final_url: str
    content_type: str
    filename: str
    title: str
    status_code: int
    provider: str = ""
    mode: ScrapeMode = "quick"


def get_scraper_config(mode: ScrapeMode = "quick") -> ScraperConfig:
    from app.config import settings
    if mode == "deep":
        provider = (settings.SCRAPER_DEEP_PROVIDER or "").strip().lower()
        timeout_s = settings.SCRAPER_DEEP_TIMEOUT_S
    else:
        provider = (
            settings.SCRAPER_QUICK_PROVIDER
            or settings.SCRAPER_PROVIDER
            or "httpx"
        ).strip().lower()
        timeout_s = settings.SCRAPER_TIMEOUT_S
    return ScraperConfig(
        provider=provider,
        timeout_s=timeout_s,
        max_bytes=settings.SCRAPER_MAX_BYTES,
        user_agent=settings.SCRAPER_USER_AGENT,
        max_redirects=settings.SCRAPER_MAX_REDIRECTS,
        allow_private_hosts=settings.SCRAPER_ALLOW_PRIVATE_HOSTS,
    )
```

In `registry.py`, keep provider functions unchanged and stamp provenance at the boundary:

```python
from dataclasses import replace
from app.orchestra.ai.ingestion.scraper.base import ScrapeMode

async def fetch_url(
    url: str,
    cfg: Optional[ScraperConfig] = None,
    *,
    mode: ScrapeMode = "quick",
) -> FetchedPage:
    cfg = cfg or get_scraper_config(mode)
    if not cfg.provider:
        raise ScrapeError(
            "Deep Preview is not configured." if mode == "deep" else "Scraper is not configured.",
            reason="deep_provider_unconfigured" if mode == "deep" else "unknown_provider",
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
```

- [ ] **Step 4: Run focused and existing unit tests**

Run: `pytest tests/unit/ingestion/test_scraper_roles.py tests/unit -q`

Expected: all tests PASS.

- [ ] **Step 5: Commit the contracts**

```bash
git add app/config.py app/orchestra/ai/ingestion/scraper/base.py app/orchestra/ai/ingestion/scraper/registry.py tests/unit/ingestion/test_scraper_roles.py
git commit -m "feat: add quick and deep scraper roles"
```

---

### Task 2: Firecrawl Provider Adapter

**Files:**
- Create: `app/orchestra/ai/ingestion/scraper/firecrawl.py`
- Modify: `app/orchestra/ai/ingestion/scraper/__init__.py`
- Test: `tests/unit/ingestion/test_firecrawl_provider.py`

**Interfaces:**
- Consumes: `ScraperConfig`, `FetchedPage`, `ScrapeError`, `validate_url`, and `register`.
- Produces: registered provider `firecrawl: async (str, ScraperConfig) -> FetchedPage`.
- Produces: Firecrawl output as `page.md` UTF-8 bytes; no vendor type escapes the module.

- [ ] **Step 1: Write mocked provider tests**

Create tests using `httpx.MockTransport`; cover a successful Markdown response plus explicit parameterized mappings:

```python
import httpx
import pytest

from app.orchestra.ai.ingestion.scraper.base import ScrapeError, get_scraper_config
from app.orchestra.ai.ingestion.scraper.firecrawl import fetch_firecrawl


@pytest.mark.anyio
async def test_firecrawl_returns_markdown_page(monkeypatch):
    payload = {
        "success": True,
        "data": {
            "markdown": "# SBI Card ELITE\n\nEarn 5X reward points.",
            "metadata": {
                "title": "SBI Credit Cards",
                "sourceURL": "https://www.sbicard.com/en/personal/credit-cards.html",
                "statusCode": 200,
            },
        },
    }
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.firecrawl._transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")

    page = await fetch_firecrawl("https://www.sbicard.com/en/personal/credit-cards.html", get_scraper_config("deep"))
    assert page.filename == "page.md"
    assert page.raw.startswith(b"# SBI Card ELITE")
    assert page.title == "SBI Credit Cards"


@pytest.mark.anyio
@pytest.mark.parametrize("status,reason", [
    (401, "deep_provider_unconfigured"),
    (429, "provider_rate_limited"),
    (500, "provider_unavailable"),
])
async def test_firecrawl_maps_upstream_errors(monkeypatch, status, reason):
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json={"error": "upstream"}))
    monkeypatch.setattr("app.orchestra.ai.ingestion.scraper.firecrawl._transport", transport)
    monkeypatch.setattr("app.config.settings.FIRECRAWL_API_KEY", "test-key")
    with pytest.raises(ScrapeError) as exc:
        await fetch_firecrawl("https://example.com", get_scraper_config("deep"))
    assert exc.value.reason == reason
```

Add separate tests for blank API key, timeout, malformed JSON, empty Markdown,
provider-reported final private URL, and `cfg.max_bytes` overflow.

- [ ] **Step 2: Run tests and verify failure**

Run: `pytest tests/unit/ingestion/test_firecrawl_provider.py -v`

Expected: FAIL because `firecrawl.py` does not exist.

- [ ] **Step 3: Implement the adapter with the existing HTTP client**

Create `firecrawl.py` with this public function and registered wrapper:

```python
from __future__ import annotations

import httpx
import structlog

from app.config import settings
from .base import FetchedPage, ScrapeError, ScraperConfig
from .registry import register
from .safety import validate_url

logger = structlog.get_logger()
_transport: httpx.AsyncBaseTransport | None = None


async def fetch_firecrawl(url: str, cfg: ScraperConfig) -> FetchedPage:
    safe_url = validate_url(url, allow_private_hosts=cfg.allow_private_hosts)
    api_key = settings.FIRECRAWL_API_KEY.strip()
    if not api_key:
        raise ScrapeError("Deep Preview is not configured.",
                          reason="deep_provider_unconfigured", status_hint=503)

    endpoint = settings.FIRECRAWL_BASE_URL.rstrip("/") + "/v1/scrape"
    try:
        async with httpx.AsyncClient(timeout=cfg.timeout_s, transport=_transport) as client:
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"url": safe_url, "formats": ["markdown"], "onlyMainContent": True},
            )
    except httpx.TimeoutException as exc:
        raise ScrapeError("Deep Preview timed out.", reason="provider_timeout", status_hint=408) from exc
    except httpx.RequestError as exc:
        raise ScrapeError("Deep Preview provider is unavailable.", reason="provider_unavailable", status_hint=503) from exc

    if response.status_code == 429:
        raise ScrapeError("Deep Preview provider is rate limited.", reason="provider_rate_limited", status_hint=429)
    if response.status_code in (401, 403):
        raise ScrapeError("Deep Preview is not configured correctly.", reason="deep_provider_unconfigured", status_hint=503)
    if response.status_code >= 500:
        raise ScrapeError("Deep Preview provider is unavailable.", reason="provider_unavailable", status_hint=503)
    if response.status_code >= 400:
        raise ScrapeError("The provider could not access this page.", reason="provider_blocked", status_hint=422)

    try:
        data = response.json().get("data", {})
        markdown = data.get("markdown", "").strip()
        metadata = data.get("metadata", {})
    except (TypeError, ValueError, AttributeError) as exc:
        raise ScrapeError("Deep Preview returned an invalid response.", reason="provider_bad_response", status_hint=502) from exc
    raw = markdown.encode("utf-8")
    if not raw:
        raise ScrapeError("Deep Preview found no extractable content.", reason="provider_bad_response", status_hint=422)
    if len(raw) > cfg.max_bytes:
        raise ScrapeError("Deep Preview content is too large.", reason="too_large", status_hint=413)
    final_url = validate_url(metadata.get("sourceURL") or safe_url,
                             allow_private_hosts=cfg.allow_private_hosts)
    return FetchedPage(
        raw=raw, final_url=final_url,
        content_type="text/markdown; charset=utf-8", filename="page.md",
        title=(metadata.get("title") or final_url)[:200],
        status_code=int(metadata.get("statusCode") or 200),
    )


@register("firecrawl")
async def _fetch_firecrawl(url: str, cfg: ScraperConfig) -> FetchedPage:
    return await fetch_firecrawl(url, cfg)
```

Import `firecrawl` for registration in `scraper/__init__.py` and export no
vendor-specific symbols from the package root.

- [ ] **Step 4: Run provider and scraper tests**

Run: `pytest tests/unit/ingestion/test_firecrawl_provider.py tests/unit/ingestion/test_scraper_roles.py -v`

Expected: all tests PASS and no network request occurs.

- [ ] **Step 5: Commit the adapter**

```bash
git add app/orchestra/ai/ingestion/scraper/firecrawl.py app/orchestra/ai/ingestion/scraper/__init__.py tests/unit/ingestion/test_firecrawl_provider.py
git commit -m "feat: add Firecrawl scraper provider"
```

---

### Task 3: Provider-Neutral Extraction Quality

**Files:**
- Create: `app/orchestra/ai/ingestion/scraper/quality.py`
- Test: `tests/unit/ingestion/test_scrape_quality.py`

**Interfaces:**
- Produces: `QualityRating = Literal["good", "questionable", "poor"]`
- Produces: immutable `ExtractionQuality(score: int, rating: QualityRating, reasons: tuple[str, ...])`.
- Produces: `assess_extraction(text: str) -> ExtractionQuality`.

- [ ] **Step 1: Write fixture-driven failing tests**

```python
from app.orchestra.ai.ingestion.scraper.quality import assess_extraction


def test_product_content_is_good():
    text = """SBI Card ELITE
Annual fee: INR 4,999 plus taxes.
Earn five reward points for every INR 100 spent on dining and groceries.
Receive complimentary domestic and international airport lounge access.
The renewal fee is reversed on reaching the stated annual spend milestone."""
    result = assess_extraction(text)
    assert result.rating == "good"
    assert result.score >= 70


def test_long_navigation_is_not_mistaken_for_content():
    menu = "\n".join(["FAQs", "Terms & Conditions", "Contact Us", "View All Cards"] * 30)
    result = assess_extraction(menu)
    assert result.rating == "poor"
    assert "high_repetition" in result.reasons
    assert "navigation_dominant" in result.reasons


def test_short_but_valid_notice_is_questionable_not_empty():
    result = assess_extraction("Applications are temporarily unavailable during scheduled maintenance.")
    assert result.rating == "questionable"
```

Add boundary tests at scores 39/40 and 69/70 by testing the private
`_rating_for_score` helper directly.

- [ ] **Step 2: Run tests and verify failure**

Run: `pytest tests/unit/ingestion/test_scrape_quality.py -v`

Expected: FAIL because `quality.py` does not exist.

- [ ] **Step 3: Implement deterministic scoring**

Implement normalized non-empty lines, word count, unique-line ratio, repeated
line ratio, short menu-line ratio, prose-line ratio, and boilerplate phrases.
Use explicit deductions from a starting score of 100:

```python
from dataclasses import dataclass
from typing import Literal
import re

QualityRating = Literal["good", "questionable", "poor"]
_BOILERPLATE = re.compile(
    r"^(faq|faqs|terms(?: & | and )conditions|contact us|privacy policy|"
    r"login|register now|view all|quick links|important links)$", re.I,
)

@dataclass(frozen=True)
class ExtractionQuality:
    score: int
    rating: QualityRating
    reasons: tuple[str, ...]

def _rating_for_score(score: int) -> QualityRating:
    return "good" if score >= 70 else "questionable" if score >= 40 else "poor"

def assess_extraction(text: str) -> ExtractionQuality:
    lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
    words = re.findall(r"\b[\w₹$%.,+-]+\b", text)
    normalized = [line.casefold() for line in lines]
    unique_ratio = len(set(normalized)) / max(len(normalized), 1)
    menu_lines = sum(bool(_BOILERPLATE.match(line)) or len(line.split()) <= 4 for line in lines)
    menu_ratio = menu_lines / max(len(lines), 1)
    prose_lines = sum(len(line.split()) >= 8 and bool(re.search(r"[.!?]$", line)) for line in lines)
    prose_ratio = prose_lines / max(len(lines), 1)

    score, reasons = 100, []
    if len(text.strip()) < 200 or len(words) < 40:
        score -= 35; reasons.append("too_little_content")
    if unique_ratio < 0.55:
        score -= 35; reasons.append("high_repetition")
    if menu_ratio > 0.65:
        score -= 35; reasons.append("navigation_dominant")
    if len(lines) >= 8 and prose_ratio < 0.12:
        score -= 20; reasons.append("low_prose_density")
    score = max(0, min(100, score))
    return ExtractionQuality(score, _rating_for_score(score), tuple(reasons))
```

Adjust only the fixture inputs—not the published 40/70 rating thresholds—if
tests reveal a boundary artifact. Keep reason codes stable for API/UI use.

- [ ] **Step 4: Run quality tests**

Run: `pytest tests/unit/ingestion/test_scrape_quality.py -v`

Expected: all tests PASS.

- [ ] **Step 5: Commit the scorer**

```bash
git add app/orchestra/ai/ingestion/scraper/quality.py tests/unit/ingestion/test_scrape_quality.py
git commit -m "feat: assess URL extraction quality"
```

---

### Task 4: Deep Preview Limits, Cache Provenance, and API Contract

**Files:**
- Create: `app/orchestra/ai/ingestion/scraper/limits.py`
- Modify: `app/orchestra/ai/ingestion/scraper/cache.py`
- Modify: `app/orchestra/ai/ingestion/scraper/__init__.py`
- Modify: `app/api/v1/documents.py`
- Test: `tests/unit/api/test_url_preview.py`

**Interfaces:**
- Consumes: `fetch_url(..., mode=...)`, `assess_extraction`, `FetchedPage.provider`, and `FetchedPage.mode`.
- Produces: `DeepPreviewLease` async context manager.
- Produces: `PreviewUrlRequest.mode: Literal["quick", "deep"] = "quick"`.
- Produces: `PreviewUrlResponse.mode`, `.provider`, and `.quality`.
- Produces: deep-token expiry error `preview_expired` instead of a quick refetch.

- [ ] **Step 1: Write API and cache tests first**

Use FastAPI dependency overrides and monkeypatch `fetch_url`; avoid real Redis,
Firecrawl, parsing, or embedding calls. Required cases:

```python
def test_preview_without_mode_uses_quick_provider(client, mock_fetch):
    response = client.post("/api/v1/documents/rag/preview-url", json={"url": "https://example.com"})
    assert response.status_code == 200
    assert response.json()["mode"] == "quick"
    mock_fetch.assert_awaited_once_with("https://example.com", mode="quick")


def test_deep_preview_returns_quality_and_provenance(client, mock_deep_fetch):
    response = client.post(
        "/api/v1/documents/rag/preview-url",
        json={"url": "https://example.com", "mode": "deep"},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["provider"] == "firecrawl"
    assert body["quality"]["rating"] in {"good", "questionable", "poor"}


def test_expired_deep_token_does_not_refetch_quick(client, mock_fetch):
    response = client.post(
        "/api/v1/documents/rag/ingest-url",
        json={"url": "https://example.com", "preview_token": "expired", "preview_mode": "deep"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Deep Preview expired. Generate it again before adding."
    mock_fetch.assert_not_awaited()
```

Also test cache persistence of `provider`/`mode`, tenant mismatch, quota error,
busy error, and that a valid deep token reaches the ingestion job without a
second fetch.

- [ ] **Step 2: Run tests and verify failure**

Run: `pytest tests/unit/api/test_url_preview.py -v`

Expected: FAIL because mode, quality, lease, and cache provenance are absent.

- [ ] **Step 3: Persist provenance in preview cache**

Add `provider` and `mode` to `store_preview` JSON and reconstruct them in
`load_preview`. Old cache entries default to `provider=""`, `mode="quick"`.

- [ ] **Step 4: Add bounded Redis limits**

Implement in `limits.py`:

```python
class DeepPreviewLimitError(ScrapeError):
    pass

class DeepPreviewLease:
    def __init__(self, *, space_id: str, user_id: str): ...
    async def __aenter__(self) -> "DeepPreviewLease": ...
    async def __aexit__(self, exc_type, exc, tb) -> None: ...
```

On enter, use the existing Redis client to:

1. `INCR deep-preview:daily:{UTC-date}:{space_id}` and set a 48-hour expiry on
   first use; if the configured quota is exceeded, decrement and raise
   `deep_quota_exceeded` with status 429.
2. Acquire `deep-preview:active:{user_id}` with `SET NX EX 30`; if acquisition
   fails, decrement the daily counter and raise `deep_busy` with status 429.
3. If Redis is unavailable, raise `deep_busy` with status 503. Do not affect
   Quick Preview.

On exit, delete only the active lock. Keep the daily count because provider
attempts consume capacity even when the target fails.

- [ ] **Step 5: Extend preview and ingestion schemas**

In `documents.py`, define:

```python
class PreviewQuality(BaseModel):
    rating: Literal["good", "questionable", "poor"]
    score: int = Field(ge=0, le=100)
    reasons: list[str]

class PreviewUrlRequest(BaseModel):
    url: str
    mode: Literal["quick", "deep"] = "quick"

class PreviewUrlResponse(BaseModel):
    # retain every existing field
    mode: Literal["quick", "deep"]
    provider: str
    quality: PreviewQuality
```

Wrap only deep calls with `DeepPreviewLease`; call
`fetch_url(req.url.strip(), mode=req.mode)`. Parse with the existing
`IngestionService`, score `parsed.full_text`, store the exact page, and return
the new fields.

Add `preview_mode: Literal["quick", "deep"] = "quick"` to `IngestUrlRequest`.
When a token cannot be loaded and `preview_mode == "deep"`, return HTTP 409
with `Deep Preview expired. Generate it again before adding.` Quick mode keeps
the existing fresh-fetch compatibility behavior.

- [ ] **Step 6: Run API and backend regression tests**

Run: `pytest tests/unit/api/test_url_preview.py tests/unit/ingestion -v`

Then run: `pytest tests/unit -q`

Expected: all tests PASS.

- [ ] **Step 7: Commit the API slice**

```bash
git add app/orchestra/ai/ingestion/scraper/limits.py app/orchestra/ai/ingestion/scraper/cache.py app/orchestra/ai/ingestion/scraper/__init__.py app/api/v1/documents.py tests/unit/api/test_url_preview.py
git commit -m "feat: expose guarded deep URL previews"
```

---

### Task 5: Quick/Deep Preview UI and Selection

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/screens/KnowledgeBase.tsx`
- Modify: `ui/package.json`
- Create: `ui/src/test/setup.ts`
- Create: `ui/src/screens/KnowledgeBase.preview.test.tsx`

**Interfaces:**
- Consumes: `POST /preview-url` with `{url, mode}` and provider-neutral quality.
- Produces: `previewUrl(url: string, mode?: 'quick' | 'deep'): Promise<UrlPreview>`.
- Produces: selected preview token and `preview_mode` in `scrapeUrl`.

- [ ] **Step 1: Add UI test tooling and failing interaction tests**

Add scripts and dev dependencies:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
and `@testing-library/user-event` as dev dependencies. Configure Vitest in the
existing Vite config with `environment: "jsdom"` and
`setupFiles: ["./src/test/setup.ts"]`. In setup, import
`@testing-library/jest-dom/vitest`.

Test these behaviors with mocked `apiClient`:

```tsx
it('keeps quick preview when deep preview fails', async () => {
  apiClient.previewUrl
    .mockResolvedValueOnce(quickPoorPreview)
    .mockRejectedValueOnce(new Error('provider unavailable'))
  // render the add-source dialog, enter URL, click Preview, then Deep Preview
  expect(await screen.findByText(quickPoorPreview.extract)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /generate deep preview/i }))
  expect(await screen.findByText(/provider unavailable/i)).toBeVisible()
  expect(screen.getByText(quickPoorPreview.extract)).toBeVisible()
})

it('submits the selected deep token', async () => {
  // generate quick then deep, select deep, submit
  expect(apiClient.scrapeUrl).toHaveBeenCalledWith(
    expect.any(String), expect.anything(), expect.anything(), expect.anything(),
    expect.anything(), expect.anything(), expect.anything(),
    deepPreview.preview_token, expect.anything(), expect.anything(), 'deep',
  )
})
```

Also test URL invalidation, switching back to Quick, and prominent warning copy
for `poor` quality.

- [ ] **Step 2: Run UI tests and verify failure**

Run: `cd ui && npm test -- KnowledgeBase.preview.test.tsx`

Expected: FAIL because mode-aware client and dual preview state do not exist.

- [ ] **Step 3: Extend client contracts**

Update `UrlPreview`:

```typescript
export type PreviewMode = 'quick' | 'deep'
export type PreviewQuality = {
  rating: 'good' | 'questionable' | 'poor'
  score: number
  reasons: string[]
}

export interface UrlPreview {
  // retain existing fields
  mode: PreviewMode
  provider: string
  quality: PreviewQuality
}
```

Update client methods:

```typescript
previewUrl: (url: string, mode: PreviewMode = 'quick'): Promise<UrlPreview> =>
  http.post('/api/v1/documents/rag/preview-url', { url, mode }).then(r => r.data)
```

Add `previewMode` as the final optional `scrapeUrl` parameter and send it as
`preview_mode`.

- [ ] **Step 4: Implement dual preview state**

Replace the single state with:

```typescript
const [quickPreview, setQuickPreview] = useState<UrlPreview | null>(null)
const [deepPreview, setDeepPreview] = useState<UrlPreview | null>(null)
const [selectedPreviewMode, setSelectedPreviewMode] = useState<PreviewMode>('quick')
const selectedPreview = selectedPreviewMode === 'deep' ? deepPreview : quickPreview
```

Quick Preview clears both results before fetching. Deep Preview leaves Quick
Preview intact, has its own loading/error state, and selects Deep only after a
successful response. Replace all ingestion and metadata references to the old
`preview` state with `selectedPreview`.

Render provider-neutral quality copy from reason codes, Quick/Deep selector
buttons when both exist, and **Generate Deep Preview** after Quick succeeds.
Use a stronger warning style for `poor`/`questionable` without preventing the
user from selecting and ingesting either result.

- [ ] **Step 5: Run UI tests, type check, and build**

Run: `cd ui && npm test -- KnowledgeBase.preview.test.tsx`

Run: `cd ui && npm run type-check`

Run: `cd ui && npm run build`

Expected: all commands PASS.

- [ ] **Step 6: Commit the UI**

```bash
git add ui/package.json ui/package-lock.json ui/src/test/setup.ts ui/src/api/client.ts ui/src/screens/KnowledgeBase.tsx ui/src/screens/KnowledgeBase.preview.test.tsx ui/vite.config.ts
git commit -m "feat: add selectable deep URL preview UI"
```

---

### Task 6: Deployment Configuration and End-to-End Verification

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `deploy/docker-compose.prod.yml`
- Test: all new backend/UI tests and existing build checks.

**Interfaces:**
- Consumes: settings defined in Task 1.
- Produces: documented, disabled-by-default deployment configuration.

- [ ] **Step 1: Document configuration without secrets**

Add to `.env.example`:

```dotenv
# URL preview providers. Quick Preview remains local/static; Deep Preview is
# disabled until FIRECRAWL_API_KEY is supplied.
SCRAPER_QUICK_PROVIDER=httpx
SCRAPER_DEEP_PROVIDER=firecrawl
SCRAPER_DEEP_TIMEOUT_S=15
FIRECRAWL_API_KEY=
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
FIRECRAWL_MAX_REQUESTS_PER_SPACE_PER_DAY=50
```

Pass the same variable names through application services in both compose
files. Use `${FIRECRAWL_API_KEY:-}` and the documented defaults; never place a
real key in the repository.

- [ ] **Step 2: Run formatting and static checks**

Run: `python -m compileall -q app/orchestra/ai/ingestion/scraper app/api/v1/documents.py`

Run: `git diff --check`

Expected: both commands succeed with no output.

- [ ] **Step 3: Run the complete automated verification**

Run: `pytest tests/unit -q`

Run: `cd ui && npm test`

Run: `cd ui && npm run type-check && npm run build`

Expected: all commands PASS.

- [ ] **Step 4: Run opt-in provider smoke tests**

With a non-production Firecrawl key supplied locally, preview these URLs using
both modes and record latency, character count, quality score, and visible
content completeness:

```text
https://example.com/
https://www.sbicard.com/en/personal/credit-cards.html
one known static documentation URL
one short valid notice page
one JavaScript-rendered product listing
one intentionally invalid or blocked URL
```

Acceptance for SBI: Deep Preview must contain specific card/product content
beyond categories, navigation, and footer links. If it does not, keep the
feature disabled and retain the provider-neutral implementation for evaluation
of another provider.

- [ ] **Step 5: Commit deployment documentation**

```bash
git add .env.example docker-compose.yml deploy/docker-compose.prod.yml
git commit -m "docs: configure Firecrawl deep previews"
```

- [ ] **Step 6: Review the final diff against acceptance criteria**

Run: `git log --oneline --max-count=8`

Run: `git status --short`

Confirm that the worktree is clean, each task has its own commit, no API key is
present in tracked files, Quick Preview works without Firecrawl configuration,
and no Firecrawl symbol appears outside its adapter, configuration, tests, or
deployment documentation.
