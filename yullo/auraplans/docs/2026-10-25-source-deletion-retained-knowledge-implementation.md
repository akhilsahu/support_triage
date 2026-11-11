# Source Deletion and Retained Knowledge Implementation Plan

> **For agentic workers:** Implement the checked tasks inline and preserve unrelated worktree changes.

**Goal:** Add an explicit purge-or-retain choice when deleting a source and show retained unsupported knowledge through a review bell on “What Aura knows.”

**Architecture:** PostgreSQL remains the canonical store for retained facts and cleanup alerts. Source deletion detaches retained facts before deleting the source, excludes them through the existing retrieval rule, and creates a Space-scoped alert. The knowledge screen reads those alerts and resolves selected facts as deleted or owner-maintained.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, React, TypeScript, TanStack Query, Tailwind, Lucide.

**Spec:** `yullo/auraplans/docs/2026-10-25-source-deletion-retained-knowledge-design.md`

## Global Constraints

- Every query must enforce owner, product, and Space boundaries.
- Existing manual entities and entities supported by another active source must remain usable.
- Cleanup notification eligibility must not depend on active/public/review state; any stored extracted entity whose source evidence is gone must be included.
- Unsupported retained facts must remain unavailable to Aura until explicit acknowledgement.
- Existing deletion callers must send purge behavior by default.
- Earlier work skipped tests. On 2026-11-11 the user authorized existing focused tests only; do not add new tests.

---

### Task 1: Persistence

**Files:**
- Create: `app/models/yullo_knowledge_cleanup_alert.py`
- Create: `alembic/versions/<revision>_add_knowledge_cleanup_alerts.py`
- Modify: `app/models/kb_fact.py`
- Modify: `app/models/__init__.py`

- [x] Add a Space-scoped cleanup alert with retained fact/entity IDs, deleted-source audit fields, status, and revision.
- [x] Add fact maintenance and deleted-source audit fields.
- [x] Keep the composite source-item foreign key on cascade and explicitly detach retained facts before deletion; `SET NULL` would also target non-null Space/KB columns.

### Task 2: Deletion and cleanup service

**Files:**
- Modify: `app/yullo/services/sources/service.py`
- Create: `app/yullo/services/sources/cleanup_alerts.py`

- [x] Count facts and entity evidence before deletion.
- [x] In retain mode, detach facts and create a pending alert; in purge mode, delete source facts.
- [x] Preserve multi-source entities, deactivate source-only extracted entities, call `delete_client_doc`, and delete stored snapshots.
- [x] Resolve alert items as deleted or owner-maintained after validating acknowledgement and Space ownership.

### Task 3: API contracts

**Files:**
- Modify: `app/schemas/yullo_onboarding.py`
- Modify: `app/api/v1/yullo_onboarding.py`
- Modify: `app/yullo/schemas/knowledge.py`
- Modify: `app/yullo/api/knowledge.py`

- [x] Add deletion-impact and mode-aware delete endpoints.
- [x] Add pending-alert list and resolution endpoints.
- [x] Return `409` for source-version conflicts and reject cross-Space IDs.

### Task 4: Deletion choice UI

**Files:**
- Modify: `ui/src/yullo/api/onboarding.ts`
- Modify: `ui/src/yullo/components/DeleteSourceConfirmDialog.tsx`
- Modify: source-deletion callers under `ui/src/yullo/`

- [x] Display impact counts and a checked-by-default permanent-delete checkbox.
- [x] Send `purge` when checked and `retain_for_review` when unchecked.
- [x] Keep non-dialog cleanup callers on explicit purge behavior.

### Task 5: Knowledge notification and review

**Files:**
- Create: `ui/src/yullo/components/KnowledgeCleanupReviewDialog.tsx`
- Modify: `ui/src/yullo/screens/knowledge/AuraKnowledgeScreen.tsx`

- [x] Fetch pending alerts for the active Space.
- [x] Show an always-visible accessible bell beside “What Aura knows,” with a count when reviews are pending.
- [x] Let the owner delete or continue using selected retained facts and structured details after checking the accuracy warning.
- [x] Refresh alerts, facts, and entities after resolution.

### Task 6: Review

- [x] Inspect the task diff while preserving the repository's existing unrelated edits and root files.
- [x] Run Python compilation and TypeScript type checks; both passed. Tests remained skipped as requested.
- [x] Update this plan. Migrations backfill both orphan facts and extracted entities without evidence; they have not been applied to any database.

## 2026-11-11 delete a processing source

Approved scope: keep Remove available during processing; deleting a source stops its preview/ingestion work and removes its data. Preserve the existing explicit retain-for-review choice and independently supported/manual knowledge.

- [x] Add source-scoped cancellation in `app/orchestra/ai/ingestion/cancellation.py`. Watch committed source existence across processes, stop async work, drain non-interruptible writes, and clean late source-specific vectors/snapshots.
- [x] Wrap Yullo preview and item ingestion in that guard. Fence preview progress with a fresh same-Space source read so stale ORM objects cannot write after deletion.
- [x] Revoke linked ingestion leases during source deletion and purge every version/document referenced by its jobs. Remove unrecorded source snapshots as well.
- [x] Keep the existing three-dot menu's Remove action available while processing, unblock confirmation from impact-count loading, refresh facts/entities and close deleted-source overlays after success. Keep source-version checks when available. Removed the duplicate standalone button following the user's correction.
- [x] Run syntax/type checks, inspect changes and update this plan. Tests require user approval under AGENTS.md; do not add tests or touch live data.

No migration or new API endpoint is planned. Cancellation changes affect only the source the owner deletes. Provider requests already accepted remotely may complete remotely; their results must never be published after deletion.

### Implementation and verification

- Backend files: new `app/orchestra/ai/ingestion/cancellation.py`; changed `orchestration.py`, `pipeline.py`, `indexing.py`, `scraper/service.py` under that ingestion package, and Yullo `services/sources/{preview,service,stream}.py`.
- UI files: `DeleteSourceConfirmDialog.tsx`, `SourceReviewSheet.tsx`, `screens/knowledge/AuraKnowledgeScreen.tsx`. The dialog disables only while removal is being submitted, keeps the default purge and explicit retain option, explains stopping analysis, and displays deletion errors. Stale source fetch/stream updates cannot reinsert a removed source locally.
- Existing `DELETE /yullo/onboarding/sources/{source_id}` behavior is extended through the same service; its API contract is unchanged. No migration, deployment, process restart, or live deletion was performed.
- AST syntax checks passed for eight changed Python files; frontend `npm run type-check` passed. Targeted ESLint passed for the dialog and knowledge screen. Linting the review sheet reports its existing unused `ImageIcon` import, left untouched.
- User approved existing tests only. All 56 selected backend tests passed across URL ingestion, scraper roles/quality, Firecrawl, source assets/grounding, fact/entity extraction and fact review. All three existing `SourceReviewSheet.test.tsx` tests passed. No tests were added or edited. The first backend invocation was blocked by the inherited `DEBUG=release`; rerunning with `DEBUG=false` passed. Backend runs used a non-live database URL and skipped the database-writing source integration tests; pytest coverage/cache outputs were disabled.
- Existing tests do not directly exercise the new cancellation guard. Runtime deletion/cleanup, multi-process behavior, and existing unguarded jobs remain unverified. API/worker reload is needed for newly started jobs to use the guard.
- Deletion is detected by a source-existence check every second after commit. Async requests are cancelled; parser threads check cancellation between progress callbacks. Threaded vector/snapshot writes finish before late-artifact cleanup, so a blocking operation may take longer to settle. Cleanup failures are logged and normal deletion continues returning its existing `pending_retry` details.
- UI correction: removed the redundant standalone Remove button; the existing three-dot menu remains the entry point and stays enabled while processing. Frontend TypeScript and targeted knowledge-screen ESLint checks passed after removal; backend cancellation and cleanup are unchanged.
