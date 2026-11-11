# Remove app/rag Implementation Plan

> **For agentic workers:** Implementation was explicitly authorized and completed inline on 2026-11-09. Runtime tests remain skipped at the user's request. No commit or deployment is authorized.

**Goal:** Remove the `app/rag/` source directory by relocating its active responsibilities into Orchestra and the backend static-asset directory, preserving working product flows and persisted data.

**Architecture:** Keep one canonical definition of each document model and one shared vector-store singleton. Move active parsing into the existing format-specific parser modules. Use temporary re-exports while switching callers, then remove all compatibility files and the old directory in the final step. This is a source-code migration, not a vector-data migration.

**Tech Stack:** Python, existing dataclasses, current ingestion/chunking services, ChromaDB and FastAPI. No new dependency is required by this migration.

**Spec:** User request to remove `app/rag/`; retain the current behavior documented in [the chunking plan, section 13](../../../app/orchestra/ai/ingestion/CHUNKING_PLAN.md) and the [production chat plan](2026-08-29-production-chat-foundation.md).

## Global constraints

- Preserve unrelated/uncommitted work. Both `app/rag/document_parser.py` and `app/rag/vector_store.py` already contain changes; migrate their current working-tree contents, not a clean historical revision.
- Preserve Support247 and Yullo authorization, Space/KB/source-version filters, publication/review rules, fact/entity extraction, embeddings and cleanup behavior.
- Preserve the configured Chroma path, collection names, document/chunk IDs, metadata keys, embedding model/dimensions, TTLs and vector-store public function signatures.
- Do not recreate collections, re-embed/re-ingest documents, reseed catalogs, rewrite stored vectors or modify database records as part of moving source files.
- Keep document models importable without initializing storage, application settings, database connections or model clients. Avoid circular imports and eager imports through package `__init__.py` files.
- Do not replace current PDF/DOCX/HTML parsers or change supported formats during this migration. Preserve current JSON/JSONL flattening and CSV serialization; improvements to those contracts are separate work.
- Runtime tests remain skipped under the user's existing instruction. Request approval before running existing tests or adding any new tests. Static checks are permitted. Integration writes require isolated temporary storage and a test database.
- No commit, push or deployment is authorized.

## Current inventory and destination map

The audit found four source/assets in `app/rag/` and 52 Python files containing `app.rag` references. Refresh this inventory before implementation because the worktree is active.

| Current responsibility | Destination | Handling |
|---|---|---|
| `document_parser.py`: `ParsedPage`, `ParsedDocument`, `Chunk` | `app/orchestra/ai/core/document_models.py` | Move exact current definitions, including physical page count, parser metadata and `Chunk.source_text`. This neutral location avoids making chunking import the ingestion service. |
| Text/Markdown parsing helpers | Existing `app/orchestra/ai/ingestion/parsers/text_parser.py` | Move the active implementations; retain Markdown links/images, code, headings and fallback behavior. |
| JSON/JSONL/CSV helpers | Existing `app/orchestra/ai/ingestion/parsers/json_csv_parser.py` | Move `_parse_json`, `_flatten_json` and `_parse_csv`; retain current outputs and errors. |
| Shared byte decoder | `app/orchestra/ai/ingestion/core/decoding.py` | Provide `decode_text(raw: bytes) -> str`, preserving the existing decoder's encoding order and replacement behavior. Both parser modules call it. |
| Older PDF/DOCX/HTML implementations, `parse`, `is_supported`, `chunk_document` | Existing `IngestionService` and chunking entry points | Migrate any discovered callers first; delete duplicate implementations only after confirming they are unreachable. Do not create a second legacy parser package. |
| `vector_store.py`, including metadata/filter helpers, constants, seeds and singleton | `app/orchestra/ai/knowledge/vector_store.py` | Relocate the complete implementation initially; keep the existing store and collection contracts. |
| `ui.html` | `app/static/knowledge/ui.html` | Preserve this served file and its API requests. `/api/v1/documents/rag/ui` currently serves it as a fallback. |
| `__init__.py` exports | Direct imports of the canonical modules above | Temporary re-exports during migration; delete them at completion. |

## Task 1: Establish the canonical document models

**Files:** Create `app/orchestra/ai/core/document_models.py`; modify `app/rag/document_parser.py` temporarily and all model importers in chunking, ingestion, API routes and `tests/unit/ingestion/test_pdf_layout.py`.

**Interfaces:** Preserve the exact constructors and properties of `ParsedPage`, `ParsedDocument` and `Chunk`. Import from the new module everywhere:

```python
from app.orchestra.ai.core.document_models import Chunk, ParsedDocument, ParsedPage
```

- [x] Copy the three current dataclass definitions into the new module, using only standard-library dependencies.
- [x] Replace their old definitions with re-exports of those same classes, never duplicate class definitions.
- [x] Update model imports in `app/orchestra/ai/chunking/`, `app/orchestra/ai/ingestion/`, `app/api/v1/admin.py`, `documents.py`, `knowledge_base.py` and existing affected tests.
- [x] Inspect `app/orchestra/ai/core/__init__.py` and parent package initialization; keep importing the new types free of storage/model initialization.
- [x] Parse affected files statically and inspect dataclass fields/properties against the working-tree baseline. Record runtime verification as pending unless approved.

## Task 2: Move active parser helpers to their existing modules

**Files:** Create `app/orchestra/ai/ingestion/core/decoding.py`; modify `parsers/text_parser.py`, `parsers/json_csv_parser.py`, temporary old parser exports and `app/orchestra/ai/ingestion/retrieval_quality_demo.py`.

**Interfaces:** Keep `TextParser.parse(raw: bytes, filename: str) -> ParsedDocument` and `JsonCsvParser.parse(raw: bytes, filename: str) -> ParsedDocument`. Keep `IngestionService.parse` and `is_supported` as the canonical public parser entry points.

- [x] Move the byte decoder into `decode_text`, preserving behavior exactly.
- [x] Move `_parse_text` and `_parse_markdown` into the text parser module. Replace the old private-helper import with local calls and the canonical model import.
- [x] Move `_parse_json`, `_flatten_json` and `_parse_csv` into the JSON/CSV parser module; use `decode_text` and canonical models.
- [x] Switch the retrieval-quality demo from `document_parser.chunk_document` to `app.orchestra.ai.chunking.chunk`; keep demo behavior otherwise unchanged.
- [x] Search for direct or dynamic calls to the old `parse`, `is_supported`, `SUPPORTED_EXTENSIONS` and private PDF/DOCX/HTML helpers. Switch any real caller to `IngestionService` before retiring its old helper.
- [x] Keep the current parser registry/fallback chains and emitted text, tables, links/images, sections and page metadata. Do not mix a parser-quality rewrite into the relocation.

## Task 3: Relocate the shared vector store without changing data

**Files:** Move `app/rag/vector_store.py` to `app/orchestra/ai/knowledge/vector_store.py`; update current vector-store importers across `app`, `scripts/reingest_docs.py` and any affected tests/demos. Temporarily replace the old file with explicit re-exports while callers migrate.

**Interfaces:** Keep `VectorStore`, `get_vector_store`, collection constants, `build_client_metadata`, `client_where`, `client_doc_type_where`, `policy_where`, `product_where`, `seed_policy_docs` and `seed_product_catalog` unchanged. Import the canonical store directly:

```python
from app.orchestra.ai.knowledge.vector_store import COLLECTION_CLIENT, get_vector_store
```

- [x] Move the current implementation intact, including all public methods and the single `_store` instance.
- [x] Ensure temporary exports delegate to the new module's singleton; do not initialize a second store/cache or retain copied collection logic.
- [x] Update ingestion jobs/pipeline, fact extraction, knowledge demos/eval, customer/API routes, Yullo source deletion/vector management/extraction/image lookup and the maintenance script.
- [x] Inspect `app/orchestra/ai/knowledge/__init__.py` and its factory imports for cycles; keep consumers on direct canonical module imports.
- [x] Compare the implementation before/after apart from imports. Confirm default `CHROMA_PERSIST_DIR`, all collection constants, metadata schema, filters and chunk-ID construction are unchanged.
- [x] Do not execute maintenance/re-ingestion/seed scripts or initialize a live persistent store for verification.

## Task 4: Preserve the document UI and its route contracts

**Files:** Move `app/rag/ui.html` to `app/static/knowledge/ui.html`; modify `app/api/v1/documents.py` asset constants and any discovered packaging/static references.

- [x] Move the existing HTML unchanged; retain its upload, document-chat and deletion API requests.
- [x] Set the base asset directory in the router:

```python
UI_BASE = Path(__file__).resolve().parents[2] / "static" / "knowledge"
UI_HTML = UI_BASE / "ui.html"
UI_ADMIN_HTML = UI_BASE / "ui" / "admin.html"
UI_CHAT_HTML = UI_BASE / "ui" / "chat.html"
```

- [x] Preserve `/rag/ui` fallback handling and `/rag/ui/admin`, `/rag/ui/chat`, `/rag/ui/chat/{client_id}` route contracts. The admin/chat HTML files are currently absent; do not fabricate replacements or claim these routes work today.
- [x] Check packaging/deployment file-copy rules include the relocated HTML. Preserve route authentication behavior; security changes to legacy UI endpoints are separate work.

## Task 5: Remove compatibility files and finalize the directory deletion

**Files:** Delete `app/rag/document_parser.py`, old vector-store re-exports and `app/rag/__init__.py` after migration; remove the emptied directory. Update current README/developer instructions and the selected chunking/embedding plans with final locations.

- [x] Search all Python/application/script/test code for `app.rag`, `app/rag`, relative imports and string-based import/asset paths; migrate every executable reference.
- [x] Remove unused compatibility `parse`/`is_supported`/`chunk_document` exports and old duplicate parsers only after all in-repository consumers use canonical entry points.
- [x] Remove the remaining old source files and retired-module bytecode caches. Do not delete `.chroma_db`, source uploads, blob storage, database records or unfamiliar user artifacts found during the audit.
- [x] Update current documentation to use the new paths; clearly label any retained historical path references in old plans.
- [x] Inspect the final diff/untracked files and record exact migrated files, verification outcomes and pending work in this plan.

## Verification and completion gate

Static verification (permitted during implementation):

```bash
rg -n 'app\.rag|app/rag' app scripts tests --glob '*.py'
rg --files app/rag
git diff --check
```

The first two searches should find no executable legacy imports/files at completion. AST-parse changed Python files without importing the application; run focused Ruff checks. Confirm only one definition of each document model and one vector-store singleton remain. Confirm the HTML exists at the router's configured destination and all existing public route paths are retained.

Existing tests to run only after explicit approval:

```bash
.venv/bin/python -m pytest tests/unit/ingestion/test_pdf_layout.py tests/unit/yullo/test_document_storage_contract.py tests/unit/yullo/test_retrieval_isolation.py tests/unit/yullo/test_source_ingestion.py
```

If approved, use temporary namespace/storage for ingestion/vector/UI integration checks, confirm metadata/filters/IDs and parser output compatibility, and compare retrieval before/after. Never run them against live source data implicitly. Do not add new tests without approval.

Completion requires `app/rag/` to be absent, all in-repository consumers migrated, source/text/metadata and vector-storage contracts preserved, and any unverified runtime behavior explicitly reported. External scripts importing `app.rag` will need the documented import changes; final deletion intentionally removes that old Python import path. Rollback before deployment consists of restoring the source/import/asset changes; there is no planned data migration to reverse.

## Status

- [x] Read-only caller, asset and persistence audit completed.
- [x] Migration plan prepared; implementation subsequently authorized and completed; runtime tests not performed.
- [x] Implementation authorized and tasks 1–5 completed.
- [x] Runtime verification explicitly skipped at owner request; live parsing/retrieval/UI integration remains unverified.

## Implementation record — 2026-11-09

Subsequent approved work changed metadata serialization in the relocated store; see [chunking plan section 15](../../../app/orchestra/ai/ingestion/CHUNKING_PLAN.md). The byte-identical store comparison below records the earlier relocation, before that separate refactor.

Completed tasks 1–5. Removed `app/rag/` completely, including obsolete bytecode/OS metadata after checking that no unfamiliar files were present. Temporary compatibility exports were removed after migrating callers. No tests were added. No persistent vector store or application was initialized, and no re-ingestion, model, database, commit or deployment operation was performed.

Static verification: all 491 Python modules in `app`, `scripts` and `tests` parsed successfully; no old package references remain in Python files. AST comparisons against a temporary pre-migration working-tree snapshot confirmed all three model definitions and all six migrated parser/decoder helper bodies were preserved (apart from renaming the decoder). SHA-256 comparison confirmed the relocated vector-store implementation and HTML asset are byte-identical to their working-tree baselines. Document API route decorators are unchanged. Only one canonical definition of each document model and `VectorStore` remains. Docker copy rules include `app/static/knowledge/ui.html` without changes. Migration-caller diff whitespace checks passed; one blank-line trailing-space issue in the touched HTML parser was cleaned up. Focused Ruff checks of the new/moved implementation modules passed.

Broader Ruff scanning found four pre-existing F821 errors: `ChatSession` at `app/api/customer.py:1305–1307` and `mcp_server` at `app/orchestra/ai/inference/factories/tools.py:95`. The same errors were confirmed by linting the original `HEAD` versions; they are not introduced or repaired by this migration. Runtime tests and live parsing/retrieval/UI checks remain explicitly skipped. External consumers of the old import paths must migrate.

Documentation updated: repository README, this plan, the chunking plan, the embedding plan and the Yullo Aura backend plan. Public route paths were preserved; only the filesystem location of the served document UI changed.

Canonical definitions/assets: `app/orchestra/ai/core/document_models.py`, `app/orchestra/ai/ingestion/core/decoding.py`, `app/orchestra/ai/ingestion/parsers/text_parser.py`, `app/orchestra/ai/ingestion/parsers/json_csv_parser.py`, `app/orchestra/ai/knowledge/vector_store.py`, `app/static/knowledge/ui.html`.

Callers/related modules now using the canonical interfaces:

- `app/api/customer.py`
- `app/api/v1/admin.py`
- `app/api/v1/chatbots.py`
- `app/api/v1/dashboard.py`
- `app/api/v1/documents.py`
- `app/api/v1/fact_extraction.py`
- `app/api/v1/knowledge_base.py`
- `app/api/v1/space_agents.py`
- `app/api/v1/superadmin.py`
- `app/orchestra/ai/chunking/chunker.py`
- `app/orchestra/ai/chunking/sizing.py`
- `app/orchestra/ai/chunking/strategies/by_structure.py`
- `app/orchestra/ai/chunking/strategies/context_enriched.py`
- `app/orchestra/ai/chunking/strategies/line_atomic.py`
- `app/orchestra/ai/chunking/strategies/markdown_blocks.py`
- `app/orchestra/ai/chunking/strategies/per_page_atomic.py`
- `app/orchestra/ai/chunking/strategies/recursive.py`
- `app/orchestra/ai/chunking/strategies/spreadsheet.py`
- `app/orchestra/ai/demochat.py`
- `app/orchestra/ai/knowledge/extraction/facts/extractor.py`
- `app/orchestra/ai/ingestion/contextual_enrichment.py`
- `app/orchestra/ai/ingestion/core/base.py`
- `app/orchestra/ai/ingestion/ingestion.py`
- `app/orchestra/ai/ingestion/jobs/tasks.py`
- `app/orchestra/ai/ingestion/parsers/docx_parser.py`
- `app/orchestra/ai/ingestion/parsers/html_parser.py`
- `app/orchestra/ai/ingestion/parsers/image_parser.py`
- `app/orchestra/ai/ingestion/parsers/json_csv_parser.py`
- `app/orchestra/ai/ingestion/parsers/pdf_parser.py`
- `app/orchestra/ai/ingestion/parsers/pptx_parser.py`
- `app/orchestra/ai/ingestion/parsers/pypdf_parser.py`
- `app/orchestra/ai/ingestion/parsers/text_parser.py`
- `app/orchestra/ai/ingestion/parsers/xlsx_parser.py`
- `app/orchestra/ai/ingestion/pipeline.py`
- `app/orchestra/ai/ingestion/retrieval_quality_demo.py`
- `app/orchestra/ai/knowledge/demo.py`
- `app/orchestra/ai/knowledge/rag_quality_eval.py`
- `app/orchestra/legacy/poc.py`
- `app/orchestra/poc.py`
- `app/orchestra/ai/appearance_preview/renderengine/base.py`
- `app/utils/ai/agent_meta_suggestion.py`
- `app/utils/ai/chat_suggestions.py`
- `app/utils/ai/doc_meta_suggestion.py`
- `app/utils/ai/document_ingestion.py`
- `app/orchestra/ai/yullo/knowledge/chat_images.py`
- `app/orchestra/ai/yullo/knowledge/extraction.py`
- `app/yullo/services/sources/vector_chunks.py`
- `app/yullo/services/sources/service.py`
- `scripts/inspect_topics.py`
- `scripts/reingest_docs.py`
- `tests/unit/ingestion/test_pdf_layout.py`


## Facts and chat-profile consolidation — 2026-11-10

- [x] Relocate the complete `app/orchestra/ai/facts/` package to `app/orchestra/ai/knowledge/extraction/facts/`, including the API engine, auditor, conflict analyzer, hierarchy, session helper and demo. Update application/test imports, documentation paths and the Ruff demo exception; retain no old-path compatibility modules.
- [x] Share subject/label/value key construction through `facts/extractor.py::fact_key` with Yullo batch and cross-batch extraction. Preserve each caller's existing lower/casefold normalization, evidence validation, diagnostics, provider fallback and feature switches. Keep the combined Yullo fact/entity pass and the separate facts API/non-Yullo flow. The v2 subject/label conflict key is unchanged.
- [x] Remove `yullo/inference/context.py`; consolidate its unchanged `load_chat_profile` into the sole application caller, `yullo/inference/runtime.py`, and update the direct test import. This is prompt identity loading, so no UI-render module was added. Active/product/live checks and category provenance filtering remain.
- [x] Static verification: parsed 20 affected Python files with AST; checked relocated fact import targets exist; searched application/tests/scripts/docs/config for obsolete imports and paths. Existing unrelated whitespace errors remain in the repository-wide diff check; task-scoped tracked-file whitespace check passes.
- [ ] Pending user approval: run existing focused fact extraction, source knowledge extraction and prompt-composition tests. No new tests written, runtime/database/provider calls executed, migrations applied, commits or deployments performed.

Endpoints unchanged: existing facts extraction/review APIs, Yullo source preview/ingestion and Aura chat retain their contracts. This consolidation changes module locations and shares the key function; it does not remove either working extraction engine.

## 2026-11-11 appearance renderengine relocation — complete

User explicitly authorized moving the existing renderengine inside the appearance package. This is a file/package relocation only, not consolidation of product policies or replacement of existing generators.

- Moved all 13 current working-tree Python modules from `app/renderengine/` into `app/orchestra/ai/appearance_preview/renderengine/`; preserved pre-existing edits and package contents. No compatibility copy/shim remains.
- Updated internal imports and active Support247 homepage/API validation callers in `app/api/space.py` and `app/api/v1/chatbots.py`. Updated model/frontend source references, existing documentation paths and the pyproject demo lint exception. Frontend component locations remain unchanged.
- Updated demo module command references and `.env` lookup from parents[2] to parents[5] for the new depth. Updated appearance package description. Generators, cache keys, timeouts, allowed sections, retrieval/provider calls, schemas and endpoint contracts remain unchanged.
- Verification: relocation compared exact source content except the intended import/path substitutions and demo environment root; 20 relevant Python files parsed, 29 relocated imports resolved to existing modules, pyproject TOML parsed, demo environment root verified, stale code/config/source references absent, scoped whitespace checks passed. No tests, app startup, provider calls, database/vector changes or deployment were performed. User requested no tests; runtime API/demo behavior remains unverified.
