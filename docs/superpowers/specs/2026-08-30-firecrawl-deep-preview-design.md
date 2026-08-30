# Firecrawl Deep Preview Design

## Summary

Add an explicit, user-triggered Deep Preview for URL knowledge sources. Quick
Preview continues to use the existing lightweight HTTP fetch. Deep Preview
uses a configured managed renderer, initially Firecrawl, through the existing
scraper registry. Both modes return the same provider-neutral result and cache
the exact bytes approved by the user for later ingestion.

This design improves extraction from JavaScript-rendered pages without running
Chromium on the Support247 application servers or coupling the API and UI to
Firecrawl.

## Goals

- Preserve the current fast and free Quick Preview behavior.
- Let a user explicitly request a deeper extraction when Quick Preview is
  incomplete or unsatisfactory.
- Return clean, indexable content from JavaScript-heavy pages.
- Make the rendering provider replaceable through configuration and a small
  provider module.
- Prevent preview and ingestion from paying for or fetching the same page
  twice.
- Identify boilerplate-heavy results instead of treating all non-empty text as
  successful extraction.
- Bound latency, spend, and provider failure impact.

## Non-goals

- Crawling an entire website from one URL.
- Automatically defeating CAPTCHAs, login walls, or explicit access controls.
- Guaranteeing successful extraction from every website.
- Replacing document, text, or Q&A ingestion.
- Building provider billing or customer chargeback in the first version.
- Automatically invoking a paid Deep Preview without user action.

## User Experience

### Quick Preview

The existing Preview button remains the primary action. It runs Quick Preview
and displays:

- extracted text and existing page metadata;
- a quality label: `good`, `questionable`, or `poor`;
- concise reasons when quality is not good;
- a **Generate Deep Preview** action.

The Deep Preview action is always available after a successful Quick Preview,
but becomes visually prominent for questionable or poor results. This lets a
user request it even when an automated quality heuristic misses a problem.

### Deep Preview

Deep Preview is labelled as slower and runs only after an explicit click. While
it runs, the UI retains the Quick Preview and shows a separate loading state.
On success, it displays the deep result and provides a way to switch between
the Quick and Deep results. The currently selected result supplies the preview
token used for ingestion.

Changing the URL invalidates all previews and tokens in the UI. A failed Deep
Preview does not destroy a successful Quick Preview.

When Deep Preview is unavailable because it is unconfigured, rate-limited, or
temporarily failing, the UI preserves Quick Preview and offers the existing
Text and Document alternatives.

## Architecture

### Package layout

```text
app/orchestra/ai/ingestion/scraper/
├── base.py          # provider-neutral contracts and configuration
├── registry.py      # provider registration and dispatch
├── providers.py     # existing httpx provider
├── firecrawl.py     # Firecrawl adapter only
├── quality.py       # provider-neutral extraction quality assessment
├── cache.py         # exact preview payload hand-off
└── safety.py        # URL and SSRF validation
```

The API, ingestion jobs, parsers, and UI must not import `firecrawl.py` or use
Firecrawl response types. They communicate through the existing `FetchedPage`
and `ScrapeError` contracts.

### Provider selection

Introduce two provider roles:

```text
SCRAPER_QUICK_PROVIDER=httpx
SCRAPER_DEEP_PROVIDER=firecrawl
```

Keep `SCRAPER_PROVIDER` as a backward-compatible fallback for the quick role.
If `SCRAPER_QUICK_PROVIDER` is unset, use `SCRAPER_PROVIDER`, then `httpx`.
Deep Preview never silently falls back to Quick Preview: doing so would label
the same extraction as deeper and could cause a user to approve bad content.

`fetch_url` accepts an optional provider override or role-resolved config. The
registry remains the only dispatcher. Adding Browserless, Zyte, or a local
Playwright implementation later requires a registered adapter and a config
change, not endpoint changes.

### Firecrawl adapter

`firecrawl.py` sends one scrape request and asks for Markdown suitable for LLM
ingestion. It converts a successful response into:

```text
FetchedPage(
    raw=<UTF-8 Markdown bytes>,
    filename="page.md",
    content_type="text/markdown; charset=utf-8",
    final_url=<provider final/source URL>,
    title=<provider page title or hostname>,
    status_code=200,
)
```

This deliberately feeds the result into the existing Markdown/text parser
instead of reparsing vendor-generated HTML with `HtmlParser`.

The adapter owns:

- authentication and Firecrawl request/response shapes;
- provider timeout handling;
- response-size enforcement;
- mapping provider errors to stable `ScrapeError.reason` values;
- rejecting empty or malformed successful responses;
- structured provider latency and outcome logs.

Use the existing HTTP client dependency rather than adding the Firecrawl SDK.
This keeps the dependency surface small and makes the adapter easy to test.

### Configuration

Add settings with environment-variable support:

```text
SCRAPER_QUICK_PROVIDER=httpx
SCRAPER_DEEP_PROVIDER=firecrawl
SCRAPER_DEEP_TIMEOUT_S=15
FIRECRAWL_API_KEY=
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
FIRECRAWL_MAX_REQUESTS_PER_SPACE_PER_DAY=50
```

The API key is server-side only and must never appear in API responses or
client bundles. A blank key makes the deep provider unavailable without
affecting Quick Preview.

## API Contract

Extend the existing request rather than adding a vendor-specific endpoint:

```json
POST /api/v1/documents/rag/preview-url
{
  "url": "https://example.com/page",
  "mode": "quick"
}
```

`mode` is an enum of `quick | deep` and defaults to `quick`, preserving current
clients.

Extend the response with provider-neutral fields:

```json
{
  "preview_token": "...",
  "mode": "deep",
  "provider": "firecrawl",
  "quality": {
    "rating": "good",
    "score": 86,
    "reasons": []
  },
  "title": "...",
  "final_url": "...",
  "content_type": "text/markdown; charset=utf-8",
  "size_bytes": 12345,
  "page_count": 1,
  "char_count": 10123,
  "extract": "...",
  "truncated": true,
  "vision_skipped": false
}
```

`provider` is diagnostic metadata, not a value the client can select. The
server maps `mode` to the configured provider so callers cannot turn the API
into an unrestricted provider proxy.

The existing ingestion endpoint and `preview_token` contract remain unchanged.
The token represents whichever preview the user selected.

## Extraction Quality

Character count alone is insufficient: the current SBI result contains plenty
of text but is dominated by menus and footer links. `quality.py` assesses the
parsed text using deterministic, inexpensive signals:

- minimum useful character and word counts;
- unique-line ratio and repeated-line ratio;
- link/menu-like short-line ratio;
- boilerplate phrase frequency;
- sentence-like prose density;
- heading-to-content balance;
- dominance of repeated navigation/footer blocks.

The scorer returns a 0–100 score, rating, and stable reason codes. Initial
thresholds are fixtures-driven rather than treated as universal truth:

- `good`: 70–100;
- `questionable`: 40–69;
- `poor`: 0–39.

Quality is advisory in the first version. A user may ingest a questionable or
poor preview after seeing it, because specialized pages can legitimately be
short or list-heavy. The UI must not claim that a score guarantees factual
completeness.

## Data Flow

### Quick Preview

1. Validate the URL using existing safety rules.
2. Resolve the quick provider and fetch the page.
3. Parse it with the existing parser selected by `FetchedPage.filename`.
4. Score the extracted text.
5. Cache the exact `FetchedPage` under the tenant-scoped preview token.
6. Return preview metadata, extract, and quality.

### Deep Preview

1. Validate the URL locally before disclosing it to the external provider.
2. Enforce tenant/user quota and in-flight request limits.
3. Resolve the deep provider and fetch rendered, cleaned content.
4. Parse and score it through the same provider-neutral pipeline.
5. Cache the exact provider output under a new tenant-scoped token.
6. Return the deep result without invalidating the Quick Preview token.

### Ingestion

1. The UI submits the token for the result the user selected.
2. The server loads and consumes the cached `FetchedPage` using existing tenant
   isolation.
3. The normal asynchronous parse, chunk, enrich, and embed job runs.
4. No Firecrawl request is made during ingestion when the token is valid.

If the token expired, retain the existing fresh-fetch behavior for Quick
Preview. For a Deep Preview token, do not silently re-fetch with the quick
provider. Return an actionable expiry error requiring a new Deep Preview, so
the indexed content cannot differ materially from what the user approved.

## Resource and Cost Controls

- Deep Preview is never automatic.
- Apply a hard provider timeout, defaulting to 15 seconds.
- Permit one in-flight Deep Preview per user and a small bounded number per
  application instance.
- Apply a per-space daily quota, defaulting to 50 and configurable.
- Cache exact results for the existing preview-token lifetime.
- Reject duplicate in-flight requests for the same tenant and normalized URL.
- Do not perform unbounded automatic retries. Allow at most one retry for a
  clearly transient provider error, within the total timeout budget.
- Log provider, tenant, latency, result size, quality rating, and outcome, but
  never API keys or full extracted content.

The first version can implement rate limits with the project's existing Redis
infrastructure. If Redis is unavailable, fail closed for Deep Preview only;
Quick Preview continues to operate.

## Security and Privacy

- Run existing scheme, hostname, DNS, and private-address validation before
  calling Firecrawl.
- Revalidate the provider-reported final URL before returning or persisting it.
- Enforce the existing maximum response size on decoded Markdown.
- Treat provider content as untrusted input throughout parsing and display.
- Render preview text as text, never as executable HTML.
- Keep preview tokens tenant-bound and short-lived.
- Document that Deep Preview sends the requested public URL to an external
  processor.
- Do not add CAPTCHA solving, authentication cookies, or logged-in scraping in
  this scope.

## Failure Handling

Stable reasons distinguish user-actionable and operational failures:

- `deep_provider_unconfigured` — Deep Preview is not enabled.
- `deep_quota_exceeded` — tenant quota reached.
- `deep_busy` — bounded concurrency is full; retry later.
- `provider_timeout` — provider exceeded the deadline.
- `provider_rate_limited` — provider returned a rate-limit response.
- `provider_blocked` — target/provider could not access the page.
- `provider_bad_response` — malformed or empty provider result.
- `provider_unavailable` — transient upstream failure.

The API translates these into appropriate HTTP status codes and concise UI
messages. Firecrawl error bodies are logged safely but are not passed through
verbatim when they may expose provider internals.

## Observability

Add structured events for:

- Quick and Deep Preview attempts and outcomes;
- provider latency and timeout rate;
- quality rating distributions by mode;
- Quick-to-Deep conversion rate;
- Deep Preview improvement, measured by score delta;
- cache redemption versus expired-token failures;
- per-space quota consumption.

These measurements determine whether Firecrawl improves real pages enough to
justify paid usage and reveal domains that need targeted handling.

## Testing

### Unit tests

- Provider registration, role selection, and backward-compatible defaults.
- Firecrawl success, redirect metadata, empty result, oversized result,
  authentication failure, rate limit, timeout, and transient failure.
- Quality fixtures for useful prose, product lists, short valid pages,
  navigation-only pages, repeated footers, and the SBI-style failure.
- Cache round-trip for Markdown and tenant isolation.
- Deep-token expiry behavior.

### API tests

- Requests without `mode` remain Quick Preview.
- Deep Preview selects only the server-configured deep provider.
- Unconfigured, quota, timeout, and busy responses are stable and actionable.
- Response schema includes provider-neutral quality data.
- A failed Deep Preview does not affect an existing Quick Preview.
- Selected deep bytes are reused by ingestion with no second provider call.

### UI tests

- Deep Preview is unavailable before Quick Preview.
- It is emphasized for poor/questionable quality and available for good
  quality.
- Quick content stays visible while Deep Preview loads or fails.
- Users can switch between successful results.
- URL changes invalidate all results.
- The selected token, not merely the latest token, is submitted.

### Integration test

Use a deterministic local JavaScript fixture plus mocked Firecrawl responses
in CI. Keep real-provider tests opt-in so CI is not dependent on network access,
credits, or a third party. Before production enablement, manually test SBI Card
and a representative set of static, dynamic, blocked, short, and PDF URLs.

## Rollout

1. Deploy the provider and API changes with Deep Preview disabled by a blank
   API key.
2. Configure Firecrawl in a non-production environment and run the URL test
   corpus.
3. Enable it for internal/admin accounts with conservative quotas.
4. Compare quality improvement, latency, and failure rate.
5. Enable it broadly while retaining Quick Preview as the default.
6. Revisit thresholds and plan size using observed Deep Preview demand.

## Acceptance Criteria

- Existing Quick Preview clients behave unchanged.
- A user can explicitly generate and select a Deep Preview.
- Deep Preview uses Firecrawl without running a browser in Support247.
- Firecrawl is isolated behind the existing provider contract and registry.
- Provider choice can be changed through configuration.
- Ingestion uses exactly the selected cached preview without another paid call.
- Navigation/footer-heavy content is reported as questionable or poor even
  when it exceeds 200 characters.
- Deep Preview failures never take down or erase Quick Preview.
- Timeouts, quotas, tenant isolation, size limits, and SSRF validation are
  covered by automated tests.
