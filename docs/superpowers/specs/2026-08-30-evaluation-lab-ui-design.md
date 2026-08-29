# Evaluation Lab UI Design

## Purpose

Add an authenticated dashboard workspace where a space owner can create
evaluation suites and cases, run a suite against its current customer-serving
chatbot, and understand why each case passed or failed.

The UI must expose the backend capabilities already available under
`/api/v1/evaluations`. It must not imply support for draft configuration,
background execution, editing, deleting, or model-based grading because those
APIs do not yet exist.

## Selected experience

Use one responsive master-detail workspace at `/app/evaluations`.

- A suite rail lets the owner choose or create a suite.
- The primary workspace shows the selected suite's cases and authoring action.
- A results area shows recent runs and the selected run's case-level evidence.
- On narrow screens, these regions stack in the same order instead of relying
  on horizontal scrolling.

This layout keeps the complete test loop visible without a multi-page wizard:
select suite, inspect coverage, add a case, run, then diagnose failures.

## Information hierarchy

The screen header contains:

- Title: `Evaluation Lab`.
- A concise explanation that evaluations call the current published runtime.
- A `Published runtime` status pill.
- A primary `Run suite` action when the selected suite has a chatbot.

The summary row contains four compact metrics derived from loaded data:

- Enabled cases in the selected suite.
- Most recent pass rate.
- Failed cases in the most recent run.
- Most recent run duration or `Not run yet`.

The main workspace contains:

1. **Suites** — name, critical marker, chatbot association, case count when
   known, selection state, and an empty state.
2. **Cases** — name, question preview, enabled state, and compact expectation
   tags for agent, terms, sources, RAG, escalation, and latency.
3. **Runs and results** — run timestamp, status, pass ratio, selected-run
   results, individual deterministic checks, actual response, agent, sources,
   RAG state, escalation intent, and latency.

## Creation flows

### Create suite

A dialog collects:

- Name, required.
- Chatbot, required by the UI even though manual-only backend suites may omit
  it. This ensures every newly created suite is immediately runnable.
- Description, optional.
- Critical-suite toggle.

Chatbots come from the existing authenticated chatbot list. Submission calls
`POST /api/v1/evaluations/suites`, selects the created suite, then refreshes
suite and case data.

### Create case

A dialog collects:

- Name and customer question, required.
- Optional expected agent.
- Required terms and forbidden terms as comma-separated values.
- Expected source identifiers as comma-separated values.
- Expected RAG and escalation as `Any`, `Yes`, or `No`.
- Optional maximum response time in milliseconds.
- Enabled toggle.

Conversation history and arbitrary customer attributes remain supported by the
backend but are excluded from this first UI form. They require a structured
editor that should be designed separately rather than exposed as unsafe raw
JSON.

Submission calls
`POST /api/v1/evaluations/suites/{suite_id}/cases`, refreshes the selected
suite's cases, and closes only after success.

## Execution and results

`Run suite` opens a confirmation dialog explaining that the operation:

- Calls real configured model and retrieval providers.
- Can incur provider cost.
- Runs only against the current published/customer-serving runtime.
- Does not create customer sessions, perform escalations, or execute external
  business actions.
- May take up to five minutes per case and currently runs synchronously.

Confirmation calls `POST /api/v1/evaluations/suites/{suite_id}/runs` with
`{"target":"published"}`. While awaiting the response, the primary action is
disabled and shows progress copy. On completion, run history refreshes, the new
run becomes selected, and its results load automatically.

Run history comes from `GET /api/v1/evaluations/runs?suite_id=...`. Results for
the selected run come from
`GET /api/v1/evaluations/runs/{run_id}/results`.

## API and type boundary

Evaluation interfaces and API methods live in the existing
`ui/src/api/client.ts` so authentication, timeout, and global 401 handling stay
centralized. The suite-run method overrides the default Axios timeout to allow
the backend's bounded synchronous execution.

Required TypeScript contracts mirror the backend exactly:

- `EvaluationExpectation`
- `EvaluationCheck`
- `EvaluationSuite`
- `EvaluationCase`
- `EvaluationRun`
- `EvaluationResult`
- Creation payloads for suites and cases

No reasoning field or raw tool payload exists in the frontend contracts.

## Component boundaries

- `ui/src/screens/Evaluations.tsx` owns data loading, selection, orchestration,
  page-level states, and responsive composition.
- `ui/src/features/evaluations/EvaluationSuiteList.tsx` renders suite selection
  and its empty state.
- `ui/src/features/evaluations/EvaluationCaseList.tsx` renders case coverage and
  expectation summaries.
- `ui/src/features/evaluations/EvaluationRunResults.tsx` renders run selection
  and diagnostic results.
- `ui/src/features/evaluations/EvaluationDialogs.tsx` owns suite, case, and run
  confirmation dialogs.
- `ui/src/features/evaluations/types.ts` contains view-specific form types and
  formatting helpers only; API response contracts remain in `api/client.ts`.

Each component receives data and callbacks. Only the page calls API methods.

## Navigation

- Register `/app/evaluations` as an authenticated route.
- Add `Evaluations` to the main navigation after Analytics using the
  `ClipboardCheck` icon.
- Add the navigation identifier to Super Admin's visibility labels.
- Add the icon to the Sidebar icon registry.
- Make the new navigation item force-visible for spaces whose older saved
  navigation configuration predates the feature. Owners can later save a new
  configuration that explicitly includes or excludes it.

## States and error handling

The screen provides explicit states for:

- Initial loading.
- No suites.
- Selected suite with no cases.
- No run history.
- Run with no results.
- API load failure with retry.
- Form validation errors.
- Submission failure without losing entered form values.
- Running state with navigation-safe explanatory copy.

API errors prefer FastAPI's `detail` value and otherwise use a concise generic
message. Provider exception details are never expected or rendered.

## Accessibility

- Dialogs use `role="dialog"`, `aria-modal="true"`, labelled headings, Escape
  handling, and a visible close control.
- All controls have text labels; icon-only controls have `aria-label`.
- Selection does not rely on colour alone.
- Pass/fail checks include icons and text.
- Focus returns naturally to the invoking control when a dialog closes.
- Reduced-motion users inherit the dashboard's existing motion handling; no
  essential state is communicated only through animation.

## Testing and verification

- TypeScript type-check must pass.
- Vite production build must pass.
- Existing Python unit tests must remain green because navigation does not
  change backend behavior.
- Manual verification covers empty state, suite creation, case creation, run
  confirmation, completed results, failed checks, mobile stacking, dark mode,
  and a forced API error.
- Search verification confirms no evaluation credential, reasoning, or raw
  tool fields are introduced.

## Deferred work

- Editing and deleting suites or cases.
- Conversation-history and customer-attribute editors.
- Draft-versus-published comparisons.
- Background job progress and cancellation.
- CSV import/export.
- Model-based graders and cost thresholds.
- Publish gating.
