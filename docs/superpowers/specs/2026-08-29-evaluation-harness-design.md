# Evaluation Harness Design

## Purpose

Add a tenant-scoped backend foundation and headless published-runtime runner for testing chatbot behavior before a full Evaluation Lab UI or automated publish gate is introduced.

## Scope

This slice stores evaluation suites and cases, accepts manually supplied normalized results or invokes the current published runtime, applies deterministic checks, and persists run/result records. It does not mutate chatbot configuration, execute external business actions, create customer-facing records, or block publishing.

## Alternatives considered

1. **Contract-first deterministic grader — selected.** Low operational risk, no model cost, and immediately testable. A later production adapter can feed real executor results into the same grader.
2. **Call the public chat API from evaluation endpoints.** Rejected because it would create customer sessions, analytics events, and possible human escalations during tests.
3. **Reuse the canonical executor below the public API — selected for live runs.** The runtime has no connected MCP/action server, and customer persistence/escalation live above it in the public API. This provides production routing and retrieval behavior without customer-side effects; draft configuration remains deferred because versioning does not exist.

## Data model

- `evaluation_suites`: one named, optionally critical collection per space and optional chatbot.
- `evaluation_cases`: question, simulated context, and deterministic expectations.
- `evaluation_runs`: target, status, and aggregate counts for one execution.
- `evaluation_results`: actual normalized output, individual checks, and failure reasons.

Every table stores `space_id`. Every API lookup scopes by the authenticated space even when a globally unique UUID is supplied.

## Deterministic checks

- Expected agent matches.
- All required terms appear in the answer.
- No forbidden term appears.
- Expected source identifiers are present.
- RAG hit matches when specified.
- Escalation state matches when specified.
- Response time stays within the configured maximum.

Checks that have no expectation are marked as skipped and cannot fail the case.

## API

- `POST /api/v1/evaluations/suites`
- `GET /api/v1/evaluations/suites`
- `POST /api/v1/evaluations/suites/{suite_id}/cases`
- `GET /api/v1/evaluations/suites/{suite_id}/cases`
- `POST /api/v1/evaluations/suites/{suite_id}/cases/{case_id}/grade`
- `GET /api/v1/evaluations/runs`

All routes require owner authentication. The grade route persists a single-case run now; batch execution can later group multiple case results under one run without changing the result schema.

## Privacy and failure behavior

Evaluation prompts and answers are tenant-scoped test data. Authorization headers, secrets, reasoning text, and raw tool payloads are not accepted by the schemas. Database errors fail the evaluation request but never affect production chat.

## Testing

- Pure unit tests cover every deterministic check and skipped expectations.
- Schema tests cover validation and forbidden extra fields.
- Model/migration imports and Alembic single-head status are verified.

## Published-configuration execution adapter

The first headless runner executes enabled cases against the chatbot currently
serving customers. The current data model has no versioned draft runtime, so
the endpoint accepts only `target="published"`; accepting `draft` before a
real draft model exists would provide a false safety guarantee.

Each case receives a fresh UUID session. Optional history and simulated
customer attributes are serialized as untrusted context in the case prompt,
followed by the current customer question. The runner then:

1. Resolves the suite, chatbot, agents, and triage leader within the
   authenticated space.
2. Builds the canonical executor with clarification disabled.
3. Calls the executor directly, without the public customer API.
4. Detects escalation intent without invoking transfer workflows.
5. Drops reasoning, render blocks, and raw tool payloads.
6. Normalizes citations to source identifiers and applies deterministic grades.
7. Persists one result per enabled case and aggregate run counts.

The canonical runtime currently receives no MCP/action server. The evaluation
adapter must continue passing none, and must never call customer persistence,
conversation-event, feedback, inbox, or escalation services.

Evaluation executors use a separate runner-cache namespace. This prevents a
headless run from inheriting clarification/tool configuration from a warmed
production runner, or warming a restricted runner that later serves customers.
Agno history, user memories, session summaries, session storage, and MCP tools
are disabled in this namespace so synthetic evaluation state cannot enter the
production session store.

The initial endpoint runs cases sequentially and caps one request at 50 enabled
cases. This keeps load predictable while the project has no evaluation worker
queue. A later background adapter can reuse the case executor without changing
the stored result contract.

## Execution API

- `POST /api/v1/evaluations/suites/{suite_id}/runs`
- `GET /api/v1/evaluations/runs/{run_id}/results`

Execution failures are isolated per case. They create a failed result with a
sanitized error code; provider exception messages are logged structurally but
are not returned or persisted because they may contain sensitive details.

## Deferred adapters

Draft execution remains deferred until chatbot, agent, and knowledge
configuration versioning exists. Background execution, publish gating,
model-based grading, and external action simulation are also outside this
slice.
