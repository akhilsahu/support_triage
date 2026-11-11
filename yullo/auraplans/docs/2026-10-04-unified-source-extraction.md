# Unified Yullo source extraction implementation plan

Goal: one grounded facts/entities extraction call per source batch, preserving source evidence and existing APIs.

- Extend existing contact JSON payload compatibly with organization, purpose and relationship; old records default to unknown.
- Add app/orchestra/ai/yullo/knowledge/extraction.py. Read original indexed chunks once, batch by configured limits, use the existing provider factory, validate facts/entities separately, and retain diagnostics. Missing input, malformed or truncated output is failure, not empty success.
- Route only Yullo item jobs through the combined extractor. Reuse existing finalization and candidate persistence; retain Support247 extraction. Make Yullo enrichment/summary calls optional, off by default.
- Emit understanding-stage batch progress through existing ingestion job fields.
- Retrieve only approved public contact entities with current, confirmed same-Space source evidence. Include purpose/ownership in the answering context without another classification call.
- Show saved contact context in source review. Replace overlapping interval polling with sequential, visibility-aware polling and backoff. Refresh facts/entities only on source completion.
- Verify combined-call count, table/prose evidence, third-party context validation, failure isolation, contact compatibility, Python checks and frontend checks.

No new database tables or production-data edits. Existing sources require re-extraction after the worker reloads. Source linkage remains in yullo_space_entity_evidence.

## Implemented / verification

- Combined extraction module, contact context, worker integration, original-PDF preference, and source progress updates are implemented.
- Existing source/entity API shapes remain compatible. Contact organization/purpose are optional JSON fields, so no migration is required. Older contacts are not assigned guessed ownership; re-extraction is required to add evidence-backed context.
- Progress updates are lease-checked and cannot overwrite terminal job state. The progress dialog now shows the combined understanding stage.
- Polling runs sequentially every 2.5 seconds only while processing, pauses when hidden, backs off to 15 seconds on errors, and stops at completion. Facts/entities refresh at completion. SSE is unnecessary for this workload; consider it later for many simultaneous jobs or push notifications.
- YULLO_KNOWLEDGE_MODEL uses the existing provider configuration when unset. Batch size, chunk count, output limit, timeout and prompt version are configurable. Yullo contextual enrichment and document summary default off. OCR/vision parsing remains governed by existing parser configuration; this change does not remove necessary OCR or embeddings.
- Source-bound contacts are retrieved only when approved/public and backed by confirmed current-version evidence. Restricted disclosure contacts are excluded from automatic contact citations. No additional classification call occurs during retrieval.
- Backend regression tests: 18 passed (combined batching, contact context/provenance, malformed/truncated response, independent output validation, prose/table correctness, legacy payload compatibility and answering context).
- Frontend TypeScript and targeted ESLint checks passed. Python syntax checks passed.
- Real provider output quality and a complete browser upload/retry cycle still require verification with a running worker. No existing SpaceX sources were regenerated and no production data was changed.

## 2026-10-05 link classification and review hardening

Implemented the approved bounded follow-up in existing files:

- app/yullo/prompts/entities.py: positive contact/action definitions and neutral-label examples; exact-source organization/purpose and destination requirements in the existing extraction call.
- app/yullo/services/entities/payloads.py: optional action organization/purpose/relationship; legacy payloads remain accepted without a migration.
- app/yullo/services/entities/extraction.py: evidenced purpose supplements CTA label correction; conversion preserves context. A shared validate_link_context enforces actual source URLs and context grounding in both extraction entry points. Complete URL matching rejects prefix/path-case substitutions. Ambiguous website candidates remain unconfirmed.
- app/orchestra/ai/yullo/knowledge/extraction.py: uses the shared validation and merges all evidence locators for duplicate entities across chunks/batches.
- Existing persistence saves every distinct same-source/version locator without retry duplicates. Context-free action identities retain their legacy hash. Owner-confirmed payloads remain untouched.
- SourceEntityCandidate.tsx: friendly labels, purpose for contacts/actions, HTTPS Open link/Open source actions, collapsible additional source references, accessible icon names and 44px touch targets. Editor payload preservation remains intact.
- SourceReviewSheet.tsx: aligned handler typing for extracted (Stop using), already supported by API/backend.

Verification: 28 focused backend tests passed; frontend TypeScript and targeted ESLint checks passed; Python syntax checks passed. Tests include invented URLs, evidenced neutral-label purpose, context preservation, multiple locators, repeated persistence without duplicates, legacy identity compatibility and owner-edit preservation.

Old-data follow-up: use the existing authorized source retry/re-extraction flow after worker reload. No database reclassification script or production writes were performed. Incorrect owner-confirmed types need explicit review; they are deliberately not silently rewritten. Browser/provider quality verification remains a manual follow-up.

## Re-extraction progress UI follow-up

- AuraKnowledgeScreen now passes the latest streamed source record into SourceReviewSheet instead of its stale selection snapshot.
- SourceReviewSheet displays worker stage, percentage and approximate ETA during queued/running processing, keeps Retry disabled for the job's duration, labels retained results as previous results, and refreshes details when processing finishes. Unknown ETA is shown as estimating, never fabricated.
- Clicking progress opens the existing ProcessingDetailsModal; the review closes first so the modal is not hidden behind it. Closing and returning uses the existing source progress indicator.
- Detail fetching depends on source ID/open state and processing transitions rather than every streamed source object, preventing repeated fact/entity requests on each percentage update.
- Verified two focused UI regression tests (live progress/previous results/completion refresh; queued/unknown ETA), TypeScript and targeted ESLint. Live browser worker-cycle verification remains pending.

### Automatic progress display on re-extract

- SourceReviewSheet now opens the existing upload extraction progress dialog automatically after a successful retry. Failed retries retain the review and show the error.
- AuraKnowledgeScreen resets the accepted retry to queued locally so polling and progress remain available if the initial source refresh fails. Existing retry endpoint is unchanged.
- Verification: all three SourceReviewSheet regression tests and frontend TypeScript check passed. Live browser/worker verification remains pending. Existing unrelated whitespace issues remain in the working tree.

## 2026-11-11 extraction latency and scraper diagnostics

- `app/orchestra/ai/ingestion/scraper/service.py`: structured `scraper.deep_fallback` event records source/Space IDs, reasons, quick quality score/rating, character count and elapsed time. Start, completion and quick/deep failure events identify the final mode and whether deep was attempted. New events omit URLs and page content. Existing scraping decisions and asset extraction remain intact.
- `app/orchestra/ai/knowledge/extraction/source_extraction.py`: resolve clients once per extraction with explicit `max_retries=0`; retain the successful provider first across subsequent batches, preserving all fallback providers. Added batch start/completion, duration and rejection-count logs. Facts, entities, evidence validation, deduplication and review behavior remain intact.
- `app/orchestra/ai/knowledge/extraction/common.py`: structured provider success/failure logs include duration, next provider and optional document/batch context; legacy fact callers retain the existing return contract.
- `app/yullo/config/inference.py`: honor validated `YULLO_KNOWLEDGE_TIMEOUT_SECONDS` rather than silently limiting it to 15 seconds. The configured default is 60 seconds; this alone does not guarantee a speed improvement.
- No API endpoints or database migrations changed. Batch concurrency remains sequential; concurrency was only proposed for consideration.
- Verification: AST syntax parsing passed for all four changed Python files; source review completed. Repository-wide `git diff --check` reports pre-existing whitespace issues outside these files, left untouched. Following approval to run existing tests only, 56 selected backend tests passed (scraper roles/quality, Firecrawl, URL ingestion, source assets/grounding, fact/entity extraction and review), plus three existing source-review UI tests. No new tests were added. Live quick/deep/provider integration and actual latency improvement remain unverified.

## 2026-11-11 source vector viewer follow-up

- Diagnosis (read-only): Space `e79e184d-0a84-4008-aad8-02afc7a05934` has one URL source ready for review, a `pending_confirm` job, and no indexed/published document. Its preview intentionally has no searchable chunks. The local vector metadata also contains 516 rows for five older source IDs absent from that Space's current source records. No source was confirmed, deleted or reindexed during diagnosis.
- [x] Extend vector source summaries with confirmation/processing state, preserve real document IDs and scope vector reads to current source document references, including existing legacy IDs. Do not expose orphan rows as current source data or delete them implicitly.
- [x] Explain awaiting-confirmation, processing, API error and search-filter states separately in the viewer. Keep the existing close control visible on narrow screens, support Escape, and portal the viewer outside clipping ancestors.
- [x] Verify syntax/types and existing focused tests only; no new tests. Browser inspection is unavailable because the browser access host is unavailable, so visual verification remains pending.

Changed files: `app/orchestra/ai/knowledge/vector_store.py` adds validated multi-document filtering to the existing read method; `app/yullo/services/sources/vector_chunks.py` maps current/legacy source IDs and sums matching chunks; `app/yullo/schemas/knowledge.py` and `ui/src/yullo/api/chunks.ts` add optional processing/confirmation fields; `ui/src/yullo/components/VectorChunksManagerModal.tsx` fixes responsive close controls, portal placement, Escape and empty/error states. Existing `GET /api/v1/yullo/spaces/{space_id}/vector-chunks` retains owner/product/Space checks. No migration, production-data write, source confirmation or reindex was performed.

Verification: Python syntax checks passed for three backend files, frontend TypeScript and targeted ESLint passed, and the 56 existing focused backend tests passed. No test files were added or changed. Those tests do not directly cover the new viewer/filter; browser layout and end-to-end source confirmation/indexing remain unverified. Browser access failed because its host is unavailable. The read-only PostgreSQL query required sandbox network escalation and succeeded; vector metadata was inspected through a read-only SQLite connection.

## 2026-11-11 correction: prepare vectors before confirmation

User clarified that the owner-facing vector chunks/embeddings section must not require source confirmation. Confirmation controls Aura publication/use, not creation of private inspection data. The previous waiting-for-confirmation message is therefore superseded.

- [x] Persist private `preview:<source>:v<version>` vectors during URL preview using existing preparation/embedding services. Keep indexing independent of fact/entity extraction failure; expose completed indexing before long extraction calls finish.
- [x] Index unconfirmed Yullo file/text ingestion through the existing pipeline, preserving Support247 preview behavior and parser/OCR policy. Unconfirmed URL retries reuse smart scraping and grounded preview extraction.
- [x] Keep private preview document IDs separate from published document IDs so late previews cannot overwrite confirmed ingestion. Preserve revision checks, source deletion cancellation, facts/entities and review; clean both private/published artifacts on deletion.
- [x] Show private chunks in the owner viewer and remove the confirmation instruction. Keep request/processing/indexing-failure states truthful and refresh while work is running.
- [x] Run syntax/type/lint checks and existing focused tests only. Do not reprocess existing live sources or modify production data implicitly; an existing unindexed source can use Re-extract after code reload.

Implementation: URL preview uses the shared `prepare_source` and `embed_and_store_chunks` services and saves actual indexed document IDs/counts before fact/entity extraction. Embedding failure does not bypass grounded extraction. `pipeline.py` has an opt-in `index_preview` argument selected only for Yullo; other products retain their preview behavior. `orchestration.py` uses private IDs for unconfirmed Yullo jobs, delegates unconfirmed URL retries to the existing smart preview service, rejects stale-version finalization, and prevents private results from publishing after concurrent confirmation. Confirmed full ingestion, OCR policy, fact/entity extraction and owner-approved values retain their existing paths. Successful canonical publication cleans the same-version private vectors. Source cancellation/deletion cleans both document namespaces. URL preview AI usage receives the existing Space/KB/product attribution scope.

Files changed: `app/yullo/services/sources/{preview,service,vector_chunks}.py`, `app/orchestra/ai/ingestion/{pipeline,orchestration,cancellation}.py`, `app/api/v1/yullo_onboarding.py` (comment clarification), `app/yullo/schemas/knowledge.py`, `ui/src/yullo/api/chunks.ts`, and `ui/src/yullo/components/VectorChunksManagerModal.tsx`. Existing endpoints remain unchanged; no migration is required. Published-source queries and public retrieval doc-ID filters remain unchanged and exclude private preview IDs.

Verification: syntax checks passed for the changed backend files; frontend TypeScript and targeted ESLint passed. The 56 existing focused source/scraper/extraction/review tests passed, plus all 10 existing URL-preview API compatibility tests. No tests were added or modified; database-writing integration cases were excluded, and test runs used a non-live database URL. These suites do not directly exercise the new private-index lifecycle. Live embedding/provider execution, concurrent confirmation/deletion and browser rendering remain unverified. No live source was reprocessed, confirmed or published. Existing unindexed sources need Re-extract after API/worker reload.

## 2026-11-11 authoritative flow: chunks active, facts reviewed

The user explicitly clarified the final policy: chunking → embedding → immediately active chunk retrieval → fact extraction → explicit fact approval for fact usage. Earlier source-confirmation/private-only retrieval gates are superseded. Owner/Product/Space boundaries, source visibility/disclosure and explicit source pausing remain enforced. Existing approved values and entity review controls must be preserved.

- [x] Activate indexed Yullo source versions immediately and expose the actual indexed document ID to retrieval, including while fact extraction is running. Do not require source confirmation or a second ingestion pass.
- [x] Extract facts/entities for initial file/text jobs as well as URLs. Keep all newly extracted facts unverified. Approving facts does not enable chunks or rerun ingestion.
- [x] Use `chunks_enabled`, default true, for explicit source pause/resume. Preserve the legacy `is_confirmed` response/update shape as the source-active UI control, independent of fact review.
- [x] Make Yullo approved-fact lookup depend on each fact's review/current-version/visibility, not source confirmation. Preserve Support247's existing policy and approved historical values.
- [x] Update source controls/copy and bulk fact approval in knowledge/onboarding screens to match. Keep entity review and public disclosure rules.
- [x] Run focused existing tests and syntax/type/lint checks only; no new tests or live source/data changes.

Implementation: `SourceService.record_source_index` validates the owner, product, Space, source revision and optional worker lease, then records actual document/count/version metadata and activates chunk retrieval before fact extraction. Initial Yullo jobs use full parsing/indexing and grounded extraction; source approval no longer causes a second pass. Smart scraping preserves its actual returned filename/raw format for parsing, including HTML tables and rendered Markdown. `source_loader.py` resolves current indexed document IDs, ignores fact approval for Yullo chunks, and preserves explicit pauses, including legacy previously-published paused sources. Support247 keeps its existing published/confirmed-source rule.

Fact usage remains limited to approved review statuses with same-Space/KB/current-version evidence, temporal/supersession checks and source visibility/disclosure. `get_authoritative_facts(..., product='yullo')` separates that rule from Support247. Existing owner-confirmed/source-authoritative values are retained; new rows remain `verified=False, review_status='extracted'`. Source pause/resume no longer promotes facts or queues ingestion. Entity review/public controls remain intact. Knowledge and onboarding bulk approval call the existing per-fact review API. Onboarding bulk approval excludes facts removed from its visible preview.

Files/endpoints: extended existing source/retrieval/fact services under `app/orchestra/ai/{db_utils,ingestion,knowledge/retrieval}` and `app/yullo/services/{sources,entities,persistence}`; updated `app/schemas/yullo_onboarding.py` and source onboarding orchestration. The existing PATCH source and fact-review endpoints are retained. Updated knowledge/onboarding screens, source review/card/link/full-preview copy and handlers. No new endpoint, migration, test file, deployment or live data write was performed.

Verification: 66 existing backend tests and three existing SourceReviewSheet UI tests passed; changed Python files parsed successfully. Frontend TypeScript passed after correcting a callback annotation. Targeted lint for the knowledge screen/link preview passed; the wider touched-file lint reports pre-existing unused `ImageIcon` (review sheet), `X`/`user` (onboarding screen), and a pre-existing effect dependency warning in SourceUnderstandingCard. No tests were added or edited. Live automatic chunk retrieval/provider execution, concurrent operations and browser rendering remain unverified. Existing sources without an index still require Re-extract after API/worker reload; no fact/source approval is needed to create or use their chunks.

FullSpaceKnowledgePreviewModal lint additionally reports its pre-existing unused `ArrowRight`/`FactItem` imports, control-character regex rule violation, and fast-refresh export warning. These unrelated issues were left unchanged.

## 2026-11-11 URL chunk inspection demo

- Added `app/orchestra/demo/scrape_url.py`: editable `URL`, sync `main(url=...)`, async `scrape_url(url=...)`, and CLI `--url`, `--output-dir`, `--deep`, `--vision` options.
- Reuses smart quick/deep scraping and `prepare_source` with the actual fetched format. Exports full chunk text/source text, page/section/table flags and metadata into separate JSON files, plus scraper quality/assets, document metadata, chunk configuration and measured timings in `summary.json`.
- Default output: repository `data/chunks/url-<timestamp>-<id>/`, covered by the existing data ignore rule. No embedding, fact extraction, source persistence or database write is performed. Vision defaults off for this demo; normal chunking configuration is preserved.
- Verified Python syntax, module CLI `--help`, and output ignore coverage. No live scrape/provider call or new test was run; actual URL export remains to be checked with the user's target URL.

## 2026-11-11 vector viewer response/error handling

- User-supplied browser response confirms the current source has `indexed_doc_id=null`, `chunk_count=0`, `chunks=[]`, and 57 scraped images. Images in the source preview are separate from indexed vector chunks. A read-only canonical service call also succeeded with zero chunks; no live records were changed.
- Updated `ui/src/yullo/components/VectorChunksManagerModal.tsx`: preserve loaded results on transient refresh failures, show a nonblocking refresh warning, keep access/deletion errors blocking, show unknown counts for failed initial loads, distinguish HTTP errors, and preserve an unavailable selected source label. Empty results explain missing indexing and separately count scraped images.
- TypeScript and focused viewer lint passed before the final empty-state copy change; final checks pending below. No tests added. Browser host unavailable; the reported initial error with a successful response has not been reproduced. Existing source still needs Re-extract to create its missing index; fact approval is not required.
- Final verification: frontend TypeScript and focused vector viewer ESLint both passed after the empty-state change. No new files beyond the existing task files, migrations, tests, or live-data changes were introduced in this follow-up.

## 2026-11-11 URL embedding diagnosis

- Read-only source/job inspection: current URL source remains `ready_to_review`, with no indexed document; latest job is `done` but has neither document ID nor chunk count. Persisted source metadata only contains assets/progress/stage/status, so it cannot explain whether earlier embedding was skipped or failed.
- Local preparation of this source's saved `home_deep.md` produced 547 parsed blocks and 475 chunks. The configured embedding model is `openai/text-embedding-3-small`, dimensions 1536, with credentials present. No source text or credentials were printed intentionally.
- Fixed URL preview metadata persistence by copying the JSON dictionary before updating it; SQLAlchemy does not track the previous in-place mutations reliably. Added safe preparation started/completed and indexing-started logs alongside existing indexed/failure events. Existing fact/entity extraction remains intact after an embedding failure.
- Canonical path: `preview.py` prepares the actual scraped format, calls `indexing.embed_and_store_chunks`, and records the active index via `SourceService.record_source_index` before extracting facts/entities. The helper uses configured VectorStore embedding and explicit vectors for Chroma.
- Live one-chunk embedding/readback probe was rejected by automatic approval review because sending saved page content to the external configured provider requires explicit approval. Asked user approval; do not retry without it. User data/index was not modified. No new tests were written.
- Verification: 11 existing URL ingestion/API preview tests passed; modified preview Python syntax passed. Live provider embedding and current source re-extraction remain pending explicit approval/action.

## 2026-11-11 approved live embedding check

- User explicitly approved sending one chunk of the saved Amazon scrape to the configured embedding provider and verifying temporary-store readback.
- Passed: saved URL scrape prepared 475 chunks; canonical `embed_and_store_chunks` with the real configured `openai/text-embedding-3-small` provider stored one chunk in a temporary Chroma directory; canonical `read_client_chunks` retrieved one chunk with exactly matching text. Temporary vector storage was removed on completion.
- The probe used a nonexistent test database endpoint, so usage telemetry failed harmlessly instead of writing to user data. No actual source/job/index was changed or re-extracted.
- Conclusion: URL scrape preparation, real embedding and vector persistence/readback work for this sample. This does not establish why the historical source job completed without indexing or verify all 475 chunks/full product lifecycle. Its existing missing index still requires Re-extract; new stage logging and metadata persistence will retain the outcome.

## 2026-11-11 actual persistent index blocker

- New source `ed35b7cd-7b11-473f-9706-6517018b4621` now correctly persists `indexing_status=failed`, while extraction finishes and its job is marked done. No indexed document or count exists. This confirms the viewer's search-preparation failure reflects an actual indexing failure.
- Read-only check of existing local `client_documents` collection found metadata only `{"hnsw:space":"cosine"}`. Canonical `_assert_embedding_compatible` deterministically raises `EmbeddingCompatibilityError` because `orchestra_embedding_model` and `orchestra_embedding_dimensions` are missing. The configured model is `openai/text-embedding-3-small`, dimensions 1536.
- The prior approved one-chunk probe created a fresh temporary collection with current metadata, so it verified provider/embedding/readback but could not expose this existing-collection incompatibility. Do not represent that probe as full current-store ingestion verification.
- No existing collection metadata was invented, collection reset, source reindexed, or shared data deleted. A controlled index migration/rebuild is required: preserve the old store, rebuild authorized sources with known model metadata, validate completeness and product/Space isolation, then switch readers/writers. Do not simply stamp current model identity onto unknown historical vectors or delete the shared index. Implementation/data-change authorization remains pending.

## 2026-11-11 approved optional legacy embedding metadata

User approved treating missing metadata as optional with code-level validation. This supersedes the prior hard-failure/migration requirement for absent identity labels only.

- Updated `VectorStore._assert_embedding_compatible` in `app/orchestra/ai/knowledge/vector_store.py`: validate configured identity; independently validate any recorded model/dimensions; always inspect actual stored vector dimensions. Missing labels no longer block a dimension-compatible legacy collection. Present malformed values and recorded/actual mismatches still fail. New collections continue recording full identity.
- Log `embedding.legacy_identity_missing` with collection, missing keys, stored/configured dimensions and whether model identity is verified. Do not backfill assumed model identity, rewrite vectors or reset collections. Existing pre-provider and locked pre-write checks both retain this validation.
- Limitation disclosed before implementation: missing historical model identity cannot be proven from matching vector dimensions; legacy acceptance cannot detect an unknown different model of the same dimensions. Known model mismatches remain blocked.
- Verification: read-only canonical compatibility validation now passes on the actual existing collection (stored/configured dimensions 1536) and confirms metadata unchanged. Eleven existing URL ingestion/API preview tests passed; no tests added. No source/index reprocessing or provider call was performed in this follow-up. Full URL re-extraction remains unverified and must be retried after backend/worker reload.

## 2026-11-11 raw vector response view

- Added Table/Raw controls to `ui/src/yullo/components/VectorChunksManagerModal.tsx`. Raw displays the complete loaded source-filtered response as formatted JSON, including chunk text, per-chunk metadata, source summaries and source images, even when chunks are empty. Existing loading/access/error handling remains in place. JSON is rendered as escaped text and computed only in Raw view; existing owner/Space-scoped endpoint is reused.
- Table remains the opening default; text/image filters apply to Table only, explained in the Raw view. Controls use the theme accent, keyboard focus and pressed states. No new endpoint, provider call or data write.
- Verification pending frontend type/lint completion. No new tests written; browser visual check remains unavailable.
- Final verification: frontend TypeScript and focused vector modal ESLint passed. Browser rendering remains unverified.

## 2026-11-11 approved generic web cleanup and chunk merging

- User approved conservative cleanup for broad websites/web apps. Keep homepages supported; do not auto-crawl or replace submitted URLs, force minimum chunk sizes, or merge distinct cards just to reduce counts.
- `html_parser.py`: shared BeautifulSoup cleanup removes scripts, hidden/aria-hidden content and navigation; prefers substantive main/role=main/pageContent/main-content landmarks. Preserve article/main headers and retain existing header/footer/body fallback for unusual pages. HTML keeps link destinations, isolates preformatted code, preserves tables and avoids duplicate extraction of nested semantic blocks. Smart scraper quick quality assessment reuses the same cleaner.
- `config.py` / `.env.example`: Firecrawl now defaults to configurable main-content extraction; explicit false retains whole-page mode. Its discovered destination appendix, asset merging and raw snapshots remain intact. `app/orchestra/ai/config.py`: validated web-only min/target/max token settings default 200/500/600, without the prior character cap. Generic global maximum can lower defaults safely; explicit contradictory limits fail validation. Existing non-web document presets remain unchanged.
- `markdown_blocks.py`: merge related same-section siblings toward token targets, retaining metadata/provenance; keep code, tables, distinct linked/media cards and different headings separate. The minimum is a preference, not a drop rule. Group scraper-generated discovered-link reference lists while respecting the storage adapter's twenty-assets-per-chunk cap, preserving all destinations.
- Wired `web=True` through Yullo URL initial/retry processing and demo; generic URL jobs pass the web configuration to the canonical pipeline. URL PDFs/other non-web formats retain their existing chunk configuration. Added safe configured-budget logging. No change to source authorization, indexing activation, fact/entity extraction or fact approval.
- Local comparison used an older saved Amazon Markdown snapshot because the original source's snapshot had been deleted: 564 legacy chunks -> 290 web chunks; all 280 unique link destinations and 158 image URLs preserved, with source spans intact. Median tokens 7 -> 16; 289 chunks remain below 200 because distinct/short cards are intentionally preserved. No claim that every chunk meets the preferred minimum. Existing snapshots cannot demonstrate the new provider-side main-content request's effect.
- Local HTML inspection confirmed nav/hidden/footer removal with title/link/table/code preservation and budgets respected; legacy header-wrapped content fallback also preserved content. Ten touched Python modules parsed; scoped diff whitespace passed. No provider call, live re-extraction, database write, migration or new repository scratch file.
- Existing focused suite: 41 passed and one old-default expectation failed under the new main-content default. All 42 passed when explicitly setting legacy `FIRECRAWL_ONLY_MAIN_CONTENT=false`, demonstrating the override remains supported. No tests added/edited. User then said tests are not required; stop further test work and leave that assertion unchanged. Live generic-site quality, new provider-side extraction and UI/provider integration remain unverified.

## 2026-11-11 conservative DOM, hygiene and heading follow-up

User explicitly selected conservative defaults instead of strict discard/fuzzy-dedup rules. User also said tests are not required; no tests were run, added or edited in this follow-up.

- `html_parser.py`: parse inline CSS declarations with quote/parenthesis and important/override handling; filter display:none, visibility:hidden/collapse, zero opacity, existing hidden/ARIA-hidden content, closed native dialogs and navigation roles. Banner/dialog roles participate in first-pass chrome filtering; existing fallback retains potentially meaningful visible dialog/banner content. Does not evaluate external CSS/computed browser styles.
- Recognize h1-h6 and ARIA headings (aria-level with safe fallback). Keep a heading stack and per-heading occurrence identity, attach heading paths to prose, tables and code, and collect non-semantic div/span text under its active heading. Preserve nested headings inside anchors and avoid duplicate extraction of heading descendants. Titles remain fallback section labels.
- `parser_service.py` and `text_parser.py`: mark explicit HTML/Markdown heading trees so the running-page-header heuristic does not erase real repeated web sections. Distinct repeated headings retain different occurrence IDs and cannot merge solely because their labels match.
- `core/text_utils.py` / `markdown_links.py`: remove standalone backslash debris and exact adjacent prose duplicates before source-span assignment; preserve code, inline code, paths, URLs, table rows and differing asset destinations. Suppress clear image-alt placeholders but keep meaningful short labels. No fuzzy substring deduplication, blanket backslash replacement, length-only deletion or automatic removal of short standalone facts. Adjacent same-text blocks combine assets only when targets are compatible; structured dedup counts contain no source text.
- `config.py`, `.env.example`, Markdown chunk strategy: configurable `INGESTION_WEB_ORPHAN_TOKENS=40`; short unlinked tails may attach to a compatible preceding same-heading group while respecting maximum tokens, table/code boundaries and asset limits. No hard minimum/discard. Non-web preset default is zero (disabled). Added safe grouping logs.
- Verification: seven changed Python modules parsed, scoped diff whitespace passed, touched-file status reviewed. Static checks only; runtime parsing, provider, UI and source re-extraction are unverified. No provider calls, database/vector writes, source reprocessing or new repository files were performed in this follow-up (existing task files were extended).
