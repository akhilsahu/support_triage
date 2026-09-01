# Data Source Assisted Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import a cURL command, OpenAPI operation, or endpoint and receive safe, reviewable connection/tool suggestions before saving them to the existing registry.

**Architecture:** Deterministic parsers create a provider-neutral `DataSourceDraft`; structural response analysis fills record paths and exact mappings; the shared LLM service contributes only validated semantic suggestions. Draft endpoints never persist or activate configuration, and the UI sends reviewed drafts through the Phase 1 connection/tool/assignment/test APIs.

**Tech Stack:** Python, FastAPI, Pydantic, PyYAML, httpx, shared LLM service, React, TypeScript, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-01-datasource-tool-registry-design.md`

## Global Constraints

- New domain logic lives under `app/services/datasource/`.
- Deterministic parsing and structural inference run before optional LLM assistance.
- Import/analyze endpoints return drafts and never write database rows or activate tools.
- Secrets are accepted only through dedicated credential fields and never sent to the LLM.
- Remote OpenAPI documents and endpoint samples use the existing outbound security/execution policies.
- Every LLM-proposed field, path, input, and agent ID is validated against observed data and active chatbot agents.
- Existing unrelated working-tree changes remain untouched.

---

### Task 1: Define and parse provider-neutral drafts

**Files:**
- Create: `app/services/datasource/importer.py`
- Modify: `app/services/datasource/contracts.py`
- Test: `tests/unit/datasource/test_importer.py`

**Interfaces:**
- Produces: `DataSourceDraft`, `DraftConnection`, and `DraftTool` dataclasses.
- Produces: `parse_curl(command: str) -> DataSourceDraft` and `parse_openapi(document: dict, operation_id: str | None) -> list[DataSourceDraft]`.

- [ ] Write failing tests covering quoted cURL arguments, `-X`, `-H`, `--data-raw`, query parameters, bearer/API-key extraction into a credential requirement without retaining the value, OpenAPI path/query inputs, request bodies, server URLs, multiple operations, and unsupported shell constructs.
- [ ] Run `DEBUG=false .venv/bin/pytest tests/unit/datasource/test_importer.py -v --no-cov` and verify imports fail.
- [ ] Implement tokenization with `shlex.split`; reject pipes, redirects, command substitution, local file reads, and non-cURL executables. Parse OpenAPI 3 JSON/YAML dictionaries without resolving external `$ref` values. Return one draft per selected safe operation.
- [ ] Run the importer tests and verify they pass.
- [ ] Commit with `git add app/services/datasource/contracts.py app/services/datasource/importer.py && git add -f tests/unit/datasource/test_importer.py && git commit -m "feat(datasource): add curl and OpenAPI draft import"`.

### Task 2: Add deterministic and optional AI analysis

**Files:**
- Create: `app/services/datasource/analyzer.py`
- Test: `tests/unit/datasource/test_analyzer.py`

**Interfaces:**
- Consumes: `DataSourceDraft`, `validate_tool_config`, `sanitize_mapping`, and `llm_service.generate_with_fallback`.
- Produces: `analyze_sample(draft: DataSourceDraft, sample: Any, agents: list[AgentSummary], use_ai: bool = True) -> AnalyzedDraft`.

- [ ] Write failing tests for nested record-array selection, root lists, exact/common-name mappings, placeholder inference, bounded samples, credential redaction, malformed/empty LLM responses, invented-field rejection, inactive-agent rejection, and deterministic fallback when the LLM is unavailable.
- [ ] Run `DEBUG=false .venv/bin/pytest tests/unit/datasource/test_analyzer.py -v --no-cov` and verify imports fail.
- [ ] Implement structural scoring that prefers non-empty arrays of objects and returns a dot-separated record path. Apply local aliases before one temperature-0.1 LLM call through the existing shared service. Filter every suggestion through observed paths and supplied active agent IDs.
- [ ] Run analyzer tests and verify they pass.
- [ ] Commit with `git add app/services/datasource/analyzer.py && git add -f tests/unit/datasource/test_analyzer.py && git commit -m "feat(datasource): add assisted draft analysis"`.

### Task 3: Expose non-persisting import, analyze, and probe endpoints

**Files:**
- Modify: `app/schemas/datasource.py`
- Modify: `app/api/v1/datasource_tools.py`
- Test: `tests/unit/api/test_datasource_onboarding_api.py`

**Interfaces:**
- Produces: `POST /api/v1/data-sources/import`, `/analyze`, and `/test`.
- Consumes: Tasks 1-2 and the existing `DataSourceExecutor`.

- [ ] Write failing endpoint tests proving import/analyze/test never add or commit ORM rows, secrets are absent from responses and analyzer arguments, unsafe remote URLs fail, selected chatbot agents are tenant-scoped, and executor failures return sanitized categories.
- [ ] Run `DEBUG=false .venv/bin/pytest tests/unit/api/test_datasource_onboarding_api.py -v --no-cov` and verify failures.
- [ ] Add strict Pydantic contracts with `extra="forbid"`, bounded command/document/sample sizes, an explicit `use_ai` flag, and operation selection. Build temporary `ToolConfig` values and execute them without persistence.
- [ ] Run onboarding API plus existing datasource API tests and verify they pass.
- [ ] Commit with `git add app/schemas/datasource.py app/api/v1/datasource_tools.py && git add -f tests/unit/api/test_datasource_onboarding_api.py && git commit -m "feat(datasource): add assisted onboarding endpoints"`.

### Task 4: Complete the guided frontend wizard

**Files:**
- Create: `ui/src/features/data-sources/types.ts`
- Create: `ui/src/features/data-sources/api.ts`
- Create: `ui/src/features/data-sources/DataSourceWizard.tsx`
- Create: `ui/src/features/data-sources/ImportStep.tsx`
- Create: `ui/src/features/data-sources/ConnectionStep.tsx`
- Create: `ui/src/features/data-sources/ToolReviewStep.tsx`
- Create: `ui/src/features/data-sources/AgentAssignmentStep.tsx`
- Create: `ui/src/features/data-sources/ActivationReviewStep.tsx`
- Create: `ui/src/features/data-sources/DataSourceWizard.test.tsx`
- Modify: `ui/src/screens/DataSourceSetup.tsx`
- Modify: `ui/src/api/client.ts`

**Interfaces:**
- Consumes: all Phase 1 and Task 3 API contracts.
- Produces: Import, Connect, Review Tool, Assign Agents, and Test & Activate steps.

- [ ] Write Vitest tests proving cURL/OpenAPI/manual modes prefill drafts, secrets never appear in review JSON, AI suggestions are visually labelled and require confirmation, inactive/triage agents cannot be selected, advanced fields stay collapsed initially, edits invalidate test success, failures preserve input, and activation requires the current successful test.
- [ ] Run `cd ui && npm test -- --run src/features/data-sources/DataSourceWizard.test.tsx` and verify failures.
- [ ] Implement the typed feature components and reduce `DataSourceSetup.tsx` to list/navigation ownership. Add accessible labels, step status, back navigation, and draft persistence only in component state.
- [ ] Run the focused Vitest suite, `npm run type-check`, and `npm run build`.
- [ ] Commit with `git add ui/src/features/data-sources ui/src/screens/DataSourceSetup.tsx ui/src/api/client.ts && git commit -m "feat(ui): add assisted data source onboarding"`.

### Task 5: Verify compatibility and document operation

**Files:**
- Modify: `README.md`
- Test: `tests/integration/test_datasource_onboarding_flow.py`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified cURL-to-active-agent-tool flow.

- [ ] Write an integration test importing cURL, analyzing a nested sample, persisting the reviewed draft through Phase 1 endpoints, assigning an active custom agent, testing, activating, and confirming another tenant cannot discover it.
- [ ] Run `DEBUG=false .venv/bin/pytest tests/integration/test_datasource_onboarding_flow.py -v --no-cov`.
- [ ] Document supported cURL/OpenAPI subsets, deterministic versus AI behavior, secret rules, draft/test/activation lifecycle, and the outbound firewall prerequisite.
- [ ] Run `DEBUG=false .venv/bin/pytest tests/unit -q --no-cov`, `cd ui && npm run build`, and `git diff --check`.
- [ ] Commit with `git add README.md && git add -f tests/integration/test_datasource_onboarding_flow.py && git commit -m "test(datasource): verify assisted onboarding flow"`.
