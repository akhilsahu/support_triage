# Document Ingestion: Async Processing + Rate-Limit Resilience — Analysis & Plan

Two reported issues from the `PRIMe-Pro-TnCekit.pdf` upload log (2026-07-26 20:38–20:44):

1. Large uploads run as one long request that times out; no progress shown.
2. `429 rate_limit_exceeded` from OpenAI (TPM 200,000 exhausted).

They are **causally linked** — the same unthrottled vision pass that makes the
upload slow is what exhausts the token budget.

---

## 1. Analysis (evidence from the log + code)

### 1.1 The upload blocks the entire server, not just the request

`app/api/v1/documents.py:195`:

```python
parsed: ParsedDocument = svc.parse(raw, filename)   # SYNC call in an async handler
```

`svc.parse()` is synchronous and internally calls the **synchronous** OpenAI
client per embedded image (`pdf_parser.py:317-337`,
`client.chat.completions.create`). There is no `await`, no thread offload.

In an `async def` FastAPI handler this **blocks the event loop** for the whole
parse — 20:38:03 → 20:44:07, ≈ **6 minutes 4 seconds**.

**Proof in the log:** 36 separate `GET /api/v1/health` requests are all logged
as `request.received` at the *same second*, `20:44:07` — the moment parsing
finished. They arrived during the block, but the loop couldn't run the logging
middleware until it was freed, then flushed them all at once.

Impact: **every other user/request on the server stalls for the duration of any
large upload.** This is almost certainly also behind earlier reports of
dashboard requests hanging.

### 1.2 The client gives up long before the server finishes

`ui/src/config/api.ts:31` → `timeout: 30000` (30s), inherited by `uploadDoc`.

Server needed 364s. Client aborts at 30s — a **12× overshoot**. The user sees a
failed upload even in the case where the server would eventually have succeeded.

### 1.3 There is nowhere to record or show progress

`KnowledgeBaseItem` (`app/models/knowledge_base.py:63`) has no status/progress
column, and `rag_upload` writes only to ChromaDB at the very end. So today an
upload is strictly all-or-nothing and invisible while in flight.

### 1.4 Why the 429 happened

Timeline: 54 vision calls, each sending a base64 image rendered at
`vision_dpi=200` with `vision_max_tokens=2000`, fired back-to-back over ~6
minutes. That consumed the org's **200,000 TPM** budget. The *next* call — the
1,575-token semantic summary at 20:44:07 — was rejected.

Two independent defects made it fatal rather than a hiccup:

- **No retry on the summary call.** `llm_service.generate_with_fallback`
  (`app/services/llm_service.py:400`) has **no 429 retry/backoff at all**. On
  failure it moves to the next provider — but watsonx and Anthropic both log
  "unavailable — skipping", so OpenAI is the only provider and the whole call
  fails. OpenAI's own response said **"Please try again in 472ms"**; a single
  short retry would have succeeded.
- **No throttling of the vision pass.** Nothing caps images per document,
  concurrency, or token spend, so ingestion can exhaust the shared budget and
  degrade unrelated features (chat, homepage generation) for a full minute.

Note the asymmetry: per-image vision *does* have `tenacity` retry
(`pdf_parser.py:321`, 5 attempts) — the summary path has none.

---

## 2. Plan

### Phase 1 — Make ingestion asynchronous and observable  *(fixes issue 1)*

**1.1 New table `ingestion_jobs`** (migration `0033`)

| Column | Notes |
|---|---|
| `id` UUID PK | job id returned to the client |
| `space_id` FK → spaces, CASCADE | tenant scope |
| `kb_id` UUID nullable | KB the doc belongs to |
| `filename`, `doc_type`, `kb_name` | echoed back for the listing row |
| `status` varchar(20) | `queued \| parsing \| chunking \| indexing \| done \| failed` |
| `progress` int (0–100) | coarse percentage |
| `stage_detail` varchar(200) | e.g. `"page 12 / 21"` |
| `doc_id` varchar(64) nullable | ChromaDB doc id, set on success |
| `error` text nullable | failure reason surfaced to the user |
| `chunks`, `pages` int nullable | final stats |
| `created_at` / `updated_at` | + index on `(space_id, created_at)` |

**1.2 `POST /rag/upload` returns immediately (202)**

- Validate (type, size, non-empty) synchronously — fast, keeps real errors inline.
- Persist the raw bytes to a temp path, create the job row `queued`, return
  `{ job_id, filename, status }` **202 Accepted**.
- Hand off to the job runner (§1.3).

**1.3 Pluggable job runner — new self-contained module**

Durable queue is wanted, but Celery must not leak into existing code. So the
queue lives behind a small interface in its **own module**, swappable by config:

```
app/jobs/
  __init__.py      # get_job_runner() factory — reads settings.JOB_BACKEND
  base.py          # JobRunner protocol: enqueue(task_name, **payload) -> job_id
  registry.py      # @job("ingest_document") decorator; name -> callable map
  inprocess.py     # dev/default: thread-offloaded, no infra required
  celery_app.py    # Celery app + worker entrypoint (only imported when selected)
  celery_runner.py # JobRunner impl delegating to Celery
  tasks.py         # the actual ingestion task, backend-agnostic
```

Rules that keep it plug-and-play:

- **Call sites never import Celery.** `documents.py` only ever does
  `get_job_runner().enqueue("ingest_document", job_id=...)`.
- **Tasks are plain functions** registered via `@job(...)`; they take JSON-safe
  args (ids and paths, never ORM objects or file handles) so they serialise
  identically under either backend.
- **`JOB_BACKEND=inprocess|celery`** in settings, defaulting to `inprocess` so
  nothing new is required to run the app locally or in CI.
- **Celery deps stay optional** — imported lazily inside `celery_runner.py`, so
  a missing `celery`/broker never breaks the default path.

`inprocess` still runs the blocking parse via `anyio.to_thread.run_sync(...)`,
so the event-loop stall (§1.1) is fixed under *both* backends. Progress
reporting and the job row are identical either way — only the transport differs.

Ops note: Celery adds a broker (Redis is already running, so it can double as
the broker) plus a worker process to run and deploy. `inprocess` keeps the
current single-process deployment working unchanged.

**1.4 Progress reporting**

Pass a `progress_cb(stage, current, total)` into the parser; the PDF page loop
already knows `page_num` and total pages, so per-page updates are nearly free.
Callback writes to the job row (throttled to ≤1 write/sec to avoid DB churn).

**1.5 New endpoints**

- `GET /documents/ingestion-jobs?kb_id=…` — active + recent jobs for the space.
- `GET /documents/ingestion-jobs/{job_id}` — single job (for polling).

**1.6 Frontend (`KnowledgeBase.tsx`)**

- On upload: show the item immediately as **"Processing…"** with a progress bar
  fed by the job row — matching the requested "show saved, then show progress
  in the listing" behaviour.
- Poll `ingestion-jobs` every ~2s **only while** at least one job is unfinished;
  stop when all are `done`/`failed`. (Polling over SSE: simpler, and the page is
  short-lived. SSE remains an option later.)
- `failed` renders the `error` text with a **Retry** action.
- Raise the axios timeout for the upload call specifically — it now only covers
  the fast validate-and-enqueue step, so a smaller ceiling is fine; the 30s
  global default stays untouched for everything else.

### Phase 2 — Rate-limit resilience  *(fixes issue 2)*

**2.1 Retry with backoff in `llm_service`** — the highest-value fix

Wrap each provider attempt in `generate_with_fallback`:
- Retry on 429 and 5xx only (never on 4xx auth/validation errors).
- Honour the `Retry-After` header / `try again in Xms` hint when present,
  else exponential backoff with jitter (e.g. 3 attempts, 0.5s → 4s).
- Only fall through to the next provider once retries are exhausted.

This alone would have made the logged failure a non-event (472ms wait).

**2.2 Skip duplicate images before spending a vision call**  *(biggest win)*

Most of the 54 calls are avoidable if the same image recurs. Logos, headers,
footers, watermarks and repeated diagrams currently each cost a full vision
call *per occurrence*. Strategy, cheapest check first:

1. **Exact-duplicate skip (content hash).** SHA-256 the raw image bytes. Keep a
   per-document `{hash: caption}` map; on a repeat, **reuse the stored caption
   with no API call**. Free, deterministic, zero quality loss — a logo on all 21
   pages collapses from 21 calls to 1.
2. **Near-duplicate skip (perceptual hash).** Same asset re-encoded/rescaled per
   page won't share a byte hash. Add a dHash/pHash with a Hamming-distance
   threshold, reusing the nearest match's caption. Slightly lossy, so put it
   behind `INGESTION_VISION_DEDUPE_PERCEPTUAL` (default on, tunable threshold).
3. **Boilerplate detection.** An image appearing on ≥ N pages at a similar
   position/size is chrome, not content — caption once, or skip entirely via
   `INGESTION_VISION_SKIP_BOILERPLATE`.

**Measure before tuning.** For *this* PDF the log shows mostly one distinct
700×800 image per page (page scans), plus four 204×134 images on page 8 — so
dedup may reclaim only a handful of calls here, while paying off hugely on
logo/watermark-heavy documents. First add a `vision.dedupe` log line reporting
`total / unique / skipped` per document, then judge from real numbers rather
than assuming.

**2.3 Tune cost, then verify quality (approved, with a check)**

- Lower `vision_dpi` (200) and `vision_max_tokens` (2000 → ~500; 2000 output
  tokens for one caption is very generous).
- `INGESTION_VISION_MAX_IMAGES_PER_DOC` (default ~40) to bound worst case; log
  clearly when the cap truncates a document.
- Concurrency semaphore so a single ingestion can't drain the TPM budget and
  starve chat/homepage generation.

**Verification gate:** re-ingest `PRIMe-Pro-TnCekit.pdf` before and after, and
diff extracted text per page (character counts + spot-check the dense pages).
Keep the new settings only if extraction is materially unchanged; otherwise
revert the DPI/token change and keep dedup, which is lossless.

**2.5 Make the summary non-fatal**

`_generate_summary` already catches exceptions and returns `""`, so ingestion
survives — but with 2.1 in place it should rarely be exercised. Verify the
empty-summary path degrades gracefully in retrieval.

**2.3 Make the summary non-fatal**

`_generate_summary` already catches exceptions and returns `""`, so ingestion
survives — but with 2.1 in place it should rarely be exercised. Verify the
empty-summary path degrades gracefully in retrieval.

---

## 3. Phasing / sequencing

Suggested landing order, smallest/safest first:

| # | Step | Value | Risk |
|---|---|---|---|
| 1 | **2.1** retry/backoff | Highest — fixes the 429 outright, ~30 lines, no schema | Low |
| 2 | **2.2** image dedupe (exact-hash) | Cuts vision calls losslessly; also relieves TPM | Low |
| 3 | **1.3** thread offload (`inprocess`) | Stops the server-wide stall | Low |
| 4 | **1.1/1.2** job table + 202 | Fixes the timeout properly | Medium (schema + API contract) |
| 5 | **1.6** UI progress in KB listing | The requested UX | Medium |
| 6 | **1.3** Celery backend | Restart-safe durability | Medium (new infra: broker + worker) |
| 7 | **2.3** DPI/token tuning | Cost | Low, gated on the quality diff |

Steps 1–3 are small, self-contained, and together remove both the hard failure
and the outage-like freeze — worth landing and reviewing before the schema/UI
work. Celery (6) is deliberately last: the pluggable interface means it's a
drop-in once everything else is proven on `inprocess`.

---

## 4. Decisions (resolved)

1. **Vision quality vs cost** — tune down DPI/max-tokens **and** add dedupe, but
   gate the tuning on a before/after extraction diff (§2.2–2.3). Dedupe by exact
   content hash is lossless and lands first; perceptual/boilerplate skipping is
   configurable.
2. **Job durability** — real queue (**Celery**), but behind a `JobRunner`
   interface in its own `app/jobs/` module, with an `inprocess` default so the
   app runs with no extra infrastructure and Celery never leaks into call sites
   (§1.3).
3. **Scope** — plan only for now; no implementation until sign-off.

## 5. Still open

1. **Retention** — how long to keep finished job rows? (suggest 7 days, swept)
2. **Concurrent uploads** — cap simultaneous ingestions per space? (suggest 2)
3. **Celery broker** — reuse the existing Redis instance, or a separate one?
