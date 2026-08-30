# Evaluation Harness Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a test and review gate after each task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped evaluation storage, deterministic grading, authenticated APIs, and a side-effect-free runner against the published runtime.

**Architecture:** Pydantic contracts define expectations and normalized actual results. A pure service grades them without database or model dependencies. SQLAlchemy models persist suites, cases, runs, and results; a dedicated adapter invokes the canonical executor below all customer-side effects, and an authenticated FastAPI router owns tenant-scoped CRUD and execution.

**Tech Stack:** Python 3.11, FastAPI, Pydantic 2, SQLAlchemy 2, PostgreSQL JSONB, Alembic, pytest.

**Spec:** `docs/superpowers/specs/2026-08-29-evaluation-harness-design.md`

## Global Constraints

- Every database query must scope by authenticated `space_id`.
- Manual grading must not invoke model providers; headless runs may invoke the canonical executor but never the production chat endpoint.
- Do not accept or persist reasoning, credentials, or raw tool payloads.
- Use deterministic grading only in this slice.
- Preserve one Alembic head.

---

### Task 1: Evaluation contracts and deterministic grader

**Files:**

- Create: `app/schemas/evaluation.py`
- Create: `app/services/evaluation_service.py`
- Test: `tests/unit/services/test_evaluation_service.py`

**Interfaces:**

- `EvaluationExpectation` defines optional checks.
- `EvaluationActual` carries normalized execution output.
- `grade_evaluation(expectation, actual) -> EvaluationGrade` returns a pass flag, individual checks, and failures.

- [x] Write failing tests for required terms, forbidden terms, agent, sources, RAG, escalation, latency, and skipped checks.
- [x] Implement strict Pydantic contracts.
- [x] Implement the pure deterministic grader.
- [x] Run the focused grader tests.

### Task 2: Evaluation persistence

**Files:**

- Create: `app/models/evaluation.py`
- Create: `alembic/versions/0044_evaluation_harness.py`
- Modify: `app/models/__init__.py`
- Test: `tests/unit/models/test_evaluation_models.py`

- [x] Write model-construction tests.
- [x] Add suite, case, run, and result models with tenant and lookup indexes.
- [x] Add migration `0044_evaluation_harness` after `0043_conversation_events`.
- [x] Verify Alembic reports one head.

### Task 3: Authenticated evaluation API

**Files:**

- Create: `app/api/v1/evaluations.py`
- Modify: `app/main.py`
- Test: `tests/unit/api/test_evaluation_api_helpers.py`

- [x] Add tenant-scoped suite and case lookup helpers.
- [x] Add suite creation/listing and case creation/listing routes.
- [x] Add the single-case grade route and persisted aggregate run.
- [x] Add run listing scoped by the authenticated space.
- [x] Register the router under `/api/v1`.
- [x] Run focused tests and compile the application.

### Task 4: Documentation and verification

**Files:**

- Modify: `implementation.md`
- Modify: `README.md`

- [x] Document the backend-only evaluation API and its non-executing scope.
- [x] Mark only the completed evaluation foundation as delivered.
- [x] Run all `tests/unit` tests.
- [x] Run `python -m compileall` and `git diff --check`.

### Task 5: Isolated published-configuration case executor

**Files:**

- Create: `app/services/evaluation_runner.py`
- Modify: `app/orchestra/ai/contracts.py`
- Test: `tests/unit/services/test_evaluation_runner.py`

**Interfaces:**

- `build_evaluation_prompt(case) -> str` serializes optional case context and history as untrusted data.
- `normalize_execution_result(result, response_ms) -> EvaluationActual` removes reasoning and tool payloads.
- `execute_evaluation_case(db, space, chatbot, case) -> EvaluationActual` invokes the canonical runtime without customer-side effects.

- [x] Write failing prompt and result-normalization tests.
- [x] Add an explicit evaluation conversation channel.
- [x] Implement agent resolution, unique sessions, direct execution, timeout, and structured logging.
- [x] Run focused runner tests.

### Task 6: Suite execution and result inspection APIs

**Files:**

- Modify: `app/schemas/evaluation.py`
- Modify: `app/api/v1/evaluations.py`
- Test: `tests/unit/api/test_evaluation_api_helpers.py`

**Interfaces:**

- `POST /api/v1/evaluations/suites/{suite_id}/runs` executes up to 50 enabled cases sequentially against `published`.
- `GET /api/v1/evaluations/runs/{run_id}/results` returns tenant-scoped normalized results.

- [x] Write failing tenant-scope and output-mapping tests.
- [x] Add strict run request and result response contracts.
- [x] Persist per-case grades and aggregate counts while isolating case failures.
- [x] Register both routes in OpenAPI and run focused API tests.

### Task 7: Runner documentation and final verification

**Files:**

- Modify: `implementation.md`
- Modify: `README.md`

- [x] Document the published-only, side-effect-free runner boundary.
- [x] Mark the headless adapter complete and draft/background execution deferred.
- [x] Run all unit tests, compileall, Alembic-head, OpenAPI, and diff checks.
