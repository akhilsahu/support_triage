# Evaluation Lab UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional authenticated Evaluation Lab for creating suites and cases, running the published chatbot runtime, and diagnosing deterministic results.

**Architecture:** The existing authenticated Axios client owns backend contracts and requests. A page-level orchestrator owns loading and mutation state, while focused presentational components render suites, cases, results, and dialogs. The feature is a responsive master-detail workspace registered in the existing Vite/React Router dashboard.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Axios, React Router 6, Tailwind CSS 3, Framer Motion, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-30-evaluation-lab-ui-design.md`

## Global Constraints

- Support only the current published/customer-serving runtime.
- Do not expose reasoning, raw tool payloads, credentials, or arbitrary JSON editors.
- Only the page component may invoke evaluation API methods.
- Preserve explicit loading, empty, error, submitting, and running states.
- Use the existing dashboard tokens, dark mode, components, Axios authentication, and global 401 handling.
- Do not imply edit/delete, background execution, cancellation, or draft comparison support.

---

### Task 1: Evaluation API contracts and authenticated client methods

**Files:**

- Modify: `ui/src/api/client.ts`

**Interfaces:**

- Produces `EvaluationExpectation`, `EvaluationCheck`, `EvaluationSuite`, `EvaluationCase`, `EvaluationRun`, `EvaluationResult`, `EvaluationSuiteCreate`, and `EvaluationCaseCreate`.
- Produces `apiClient.listEvaluationSuites(chatbotId?)`, `createEvaluationSuite(payload)`, `listEvaluationCases(suiteId)`, `createEvaluationCase(suiteId, payload)`, `listEvaluationRuns(suiteId?)`, `runEvaluationSuite(suiteId)`, and `listEvaluationResults(runId)`.

- [x] **Step 1: Add exact response contracts near the existing API types**

```ts
export interface EvaluationExpectation {
  expected_agent: string | null
  required_terms: string[]
  forbidden_terms: string[]
  expected_source_ids: string[]
  expected_rag_hit: boolean | null
  expected_escalation: boolean | null
  max_response_ms: number | null
}

export interface EvaluationCheck {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  detail: string
}
```

- [x] **Step 2: Add suite, case, run, result, and creation payload contracts**

The property names must match `app/schemas/evaluation.py`, including
`actual_source_ids`, `actual_rag_hit`, `actual_escalated`, `created_at`, and
`completed_at`.

- [x] **Step 3: Add authenticated methods using the existing `http` instance**

```ts
listEvaluationSuites: (chatbotId?: string) =>
  http.get('/api/v1/evaluations/suites', {
    params: chatbotId ? { chatbot_id: chatbotId } : {},
  }).then(r => r.data as EvaluationSuite[]),

runEvaluationSuite: (suiteId: string) =>
  http.post(
    `/api/v1/evaluations/suites/${suiteId}/runs`,
    { target: 'published' },
    { timeout: 15_300_000 },
  ).then(r => r.data as EvaluationRun),
```

The timeout covers the backend cap of 50 cases at five minutes each plus a
five-minute transport margin.

- [x] **Step 4: Verify TypeScript contracts**

Run: `cd ui && npm run type-check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/api/client.ts
git commit -m "feat: add evaluation api client contracts"
```

### Task 2: View-model helpers and suite/case lists

**Files:**

- Create: `ui/src/features/evaluations/types.ts`
- Create: `ui/src/features/evaluations/EvaluationSuiteList.tsx`
- Create: `ui/src/features/evaluations/EvaluationCaseList.tsx`

**Interfaces:**

- Consumes `EvaluationSuite`, `EvaluationCase`, and `EvaluationExpectation` from `api/client.ts`.
- Produces `splitCommaValues(value: string): string[]`, `formatExpectation(expectation): string[]`, `EvaluationSuiteList`, and `EvaluationCaseList`.

- [x] **Step 1: Add deterministic view helpers**

```ts
export const splitCommaValues = (value: string) =>
  [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]

export function formatExpectation(expectation: EvaluationExpectation): string[] {
  const labels: string[] = []
  if (expectation.expected_agent) labels.push(`Agent: ${expectation.expected_agent}`)
  if (expectation.required_terms.length) labels.push(`${expectation.required_terms.length} required term${expectation.required_terms.length === 1 ? '' : 's'}`)
  if (expectation.forbidden_terms.length) labels.push(`${expectation.forbidden_terms.length} forbidden term${expectation.forbidden_terms.length === 1 ? '' : 's'}`)
  if (expectation.expected_source_ids.length) labels.push(`${expectation.expected_source_ids.length} source${expectation.expected_source_ids.length === 1 ? '' : 's'}`)
  if (expectation.expected_rag_hit !== null) labels.push(`RAG: ${expectation.expected_rag_hit ? 'Yes' : 'No'}`)
  if (expectation.expected_escalation !== null) labels.push(`Escalation: ${expectation.expected_escalation ? 'Yes' : 'No'}`)
  if (expectation.max_response_ms !== null) labels.push(`≤ ${expectation.max_response_ms}ms`)
  return labels
}
```

- [x] **Step 2: Implement the suite rail**

`EvaluationSuiteList` receives `suites`, `selectedSuiteId`, `chatbotNames`,
`loading`, `onSelect`, and `onCreate`. It renders loading placeholders, an
empty-state create action, critical text/icon, associated chatbot, and an
`aria-current` selection marker.

- [x] **Step 3: Implement the case coverage list**

`EvaluationCaseList` receives `cases`, `loading`, `onCreate`, and
`canCreate`. It renders question previews, enabled/disabled text, and the tags
from `formatExpectation`. An empty expectation renders `Response recorded only`.

- [x] **Step 4: Verify TypeScript**

Run: `cd ui && npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/features/evaluations
git commit -m "feat: add evaluation suite and case views"
```

### Task 3: Run history and diagnostic result component

**Files:**

- Create: `ui/src/features/evaluations/EvaluationRunResults.tsx`

**Interfaces:**

- Consumes `EvaluationRun[]`, `EvaluationResult[]`, `selectedRunId`, loading flags, and `onSelectRun(runId)`.
- Produces a run selector and accessible diagnostic result cards.

- [x] **Step 1: Implement run summary formatting**

Render each run with localized start time, textual status, `passed_cases / total_cases`, and a percentage only when `total_cases > 0`.

- [x] **Step 2: Implement deterministic check rows**

Each result card shows case id, pass/fail text, actual response, agent, latency,
RAG and escalation states, source identifiers, and every check. Passed,
failed, and skipped checks use different icons plus explicit status text.

- [x] **Step 3: Add loading and empty states**

Differentiate `No runs yet` from `This run contains no results` and from a
results request still loading.

- [x] **Step 4: Verify TypeScript**

Run: `cd ui && npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/features/evaluations/EvaluationRunResults.tsx
git commit -m "feat: add evaluation run diagnostics"
```

### Task 4: Accessible creation and run-confirmation dialogs

**Files:**

- Create: `ui/src/features/evaluations/EvaluationDialogs.tsx`

**Interfaces:**

- Produces `CreateSuiteDialog`, `CreateCaseDialog`, and `ConfirmRunDialog`.
- Dialog submissions provide validated `EvaluationSuiteCreate` or `EvaluationCaseCreate` payloads to async callbacks supplied by the page.

- [x] **Step 1: Create a shared dialog frame**

The frame renders a labelled `role="dialog"`, `aria-modal="true"`, overlay,
Escape listener, close button with `aria-label="Close dialog"`, scrollable
content, and disabled close behavior while submitting.

- [x] **Step 2: Implement suite creation**

Require trimmed name and chatbot id. Preserve name, chatbot, description, and
critical toggle after API failure. Disable submit while saving.

- [x] **Step 3: Implement case creation**

Map comma-separated term/source inputs through `splitCommaValues`. Map `any`
select values to `null`, validate optional latency as an integer from 1 through
300000, and submit empty `history` and `customer_context` objects without raw
JSON fields.

```ts
const payload: EvaluationCaseCreate = {
  name: name.trim(),
  question: question.trim(),
  history: [],
  customer_context: {},
  expectation: {
    expected_agent: expectedAgent.trim() || null,
    required_terms: splitCommaValues(requiredTerms),
    forbidden_terms: splitCommaValues(forbiddenTerms),
    expected_source_ids: splitCommaValues(sourceIds),
    expected_rag_hit: rag === 'any' ? null : rag === 'yes',
    expected_escalation: escalation === 'any' ? null : escalation === 'yes',
    max_response_ms: latency.trim() ? Number(latency) : null,
  },
  enabled,
}
```

- [x] **Step 4: Implement run confirmation**

Show published-only, model-cost, synchronous duration, and side-effect boundary
copy from the spec. Use `Run published suite` as the confirmation label.

- [x] **Step 5: Verify TypeScript**

Run: `cd ui && npm run type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/features/evaluations/EvaluationDialogs.tsx
git commit -m "feat: add evaluation authoring dialogs"
```

### Task 5: Evaluation Lab page orchestration

**Files:**

- Create: `ui/src/screens/Evaluations.tsx`

**Interfaces:**

- Consumes all evaluation API methods and feature components.
- Produces the route-level `Evaluations` component.

- [x] **Step 1: Implement initial parallel loading**

Load chatbots and suites together with `Promise.all`. Prefer the suite matching
`useAppStore().currentChatbotId`; otherwise select the first suite. A load
failure renders the API detail and a Retry button.

- [x] **Step 2: Load suite-dependent data**

When selection changes, load cases and suite-filtered runs in parallel. Select
the newest run and load its results. Use a request generation counter or
cancelled effect guard so late responses cannot overwrite a newer selection.

- [x] **Step 3: Implement mutations**

Create suite, create case, and execute suite through page callbacks. Refresh
only affected data. Extract errors using:

```ts
function apiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
```

- [x] **Step 4: Implement header and summary metrics**

Render enabled-case count, latest pass rate, failed count, and duration using
`started_at`/`completed_at`. `Run suite` is unavailable without a chatbot and
disabled when there are no enabled cases or a run is active.

- [x] **Step 5: Compose responsive workspace and dialogs**

Use one column below `lg`, then a three-column grid with a compact suite rail,
case coverage panel, and wider run/results panel. Render page errors in an
`aria-live="polite"` region.

- [x] **Step 6: Verify TypeScript**

Run: `cd ui && npm run type-check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/src/screens/Evaluations.tsx
git commit -m "feat: build evaluation lab workspace"
```

### Task 6: Route, navigation, and visibility controls

**Files:**

- Modify: `ui/src/App.tsx`
- Modify: `ui/src/config/navigation.ts`
- Modify: `ui/src/components/layout/Sidebar.tsx`
- Modify: `ui/src/screens/SuperAdmin.tsx`

**Interfaces:**

- Produces authenticated `/app/evaluations` routing and a navigation entry that remains visible across legacy saved nav configurations.

- [x] **Step 1: Register the route**

Import `Evaluations` and render it inside `PrivateRoute` and `Layout` at
`/app/evaluations`.

- [x] **Step 2: Add main navigation metadata**

Add `{ id: 'evaluations', label: 'Evaluations', icon: 'ClipboardCheck', path:
'/app/evaluations', group: 'main' }` immediately after Analytics.

- [x] **Step 3: Register the icon and migration visibility**

Import/register `ClipboardCheck` in Sidebar and add `evaluations` to
`FORCE_VISIBLE_NAV` so existing saved navigation settings do not hide it.

- [x] **Step 4: Add Super Admin visibility label**

Add `'evaluations': 'Evaluations'` to `ALL_NAV_LABELS`.

- [x] **Step 5: Verify TypeScript and production build**

Run: `cd ui && npm run type-check && npm run build`

Expected: both commands PASS and Vite produces `ui/dist`.

- [ ] **Step 6: Commit**

```bash
git add ui/src/App.tsx ui/src/config/navigation.ts ui/src/components/layout/Sidebar.tsx ui/src/screens/SuperAdmin.tsx
git commit -m "feat: expose evaluation lab navigation"
```

### Task 7: Documentation and complete verification

**Files:**

- Modify: `README.md`
- Modify: `implementation.md`
- Modify: `docs/superpowers/plans/2026-08-30-evaluation-lab-ui.md`

- [x] **Step 1: Document the UI route and constraints**

Add `/app/evaluations`, published-only execution, real provider cost, and
unsupported draft/background features to the README evaluation section.

- [x] **Step 2: Update implementation status**

Mark the Evaluation Lab MVP UI complete while retaining structured history,
draft comparison, CSV import, background execution, and publish gating as
future work.

- [x] **Step 3: Verify backend regression suite**

Run: `DEBUG=false .venv/bin/pytest -o addopts='' tests/unit -q`

Expected: all tests pass.

- [x] **Step 4: Verify frontend**

Run: `cd ui && npm run type-check && npm run build`

Expected: both commands pass.

- [x] **Step 5: Verify route and privacy boundaries**

Run:

```bash
rg -n "/app/evaluations|ClipboardCheck" ui/src/App.tsx ui/src/config/navigation.ts ui/src/components/layout/Sidebar.tsx
! rg -n "reasoning|raw_tool|authorization|api_key|secret_key" ui/src/features/evaluations ui/src/screens/Evaluations.tsx
git diff --check
```

Expected: the route/icon references are present, the privacy scan is empty, and
the diff check passes.

- [ ] **Step 6: Commit**

```bash
git add README.md implementation.md docs/superpowers/plans/2026-08-30-evaluation-lab-ui.md
git commit -m "docs: document evaluation lab ui"
```
