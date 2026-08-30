# Support247.chat Implementation Plan

## 1. Purpose

This document defines the recommended implementation order for improving Support247.chat. The plan prioritizes platform reliability, measurable answer quality, and safe automation before expanding into additional channels and enterprise features.

The intended delivery order is:

1. Stabilize the conversation and agent foundation.
2. Build evaluation, observability, and knowledge-quality loops.
3. Productize safe publishing and human operations.
4. Add controlled actions and integrations.
5. Expand into proactive, multilingual, voice, and marketplace capabilities.

## 2. Planning assumptions

- Team: two backend engineers, one frontend engineer, and shared product/QA capacity.
- Existing PostgreSQL, Redis, FastAPI, React, Agno, RAG, inbox, and ingestion infrastructure will be reused.
- The Agno-based orchestration path will become the canonical production path.
- Legacy mock and keyword-based agent paths will remain available only for explicit demo or development use.
- Estimates are directional and should be recalibrated after technical discovery.

## 3. Priority definitions

| Priority | Meaning | Delivery horizon |
|---|---|---|
| P0 | Required foundation; other work should not bypass it | Weeks 1-4 |
| P1 | Immediate productization after the foundation | Weeks 5-10 |
| P2 | Strategic automation and enterprise capabilities | Months 3-6 |
| P3 | Future expansion after the core is proven | Month 6 onward |

## 4. Prioritized roadmap

| Priority | Feature | Impact | Effort | Primary dependency |
|---|---|---:|---:|---|
| P0 | Canonical conversation and agent architecture | Very high | 2-3 weeks | None |
| P0 | Durable conversation events and observability | Very high | 2 weeks | Canonical request context |
| P0 | Automated test and CI baseline | Very high | 1-2 weeks | Test-environment isolation |
| P0 | Evaluation harness MVP | Very high | 2-3 weeks | Conversation events |
| P0 | Knowledge-health MVP | Very high | 2-3 weeks | Retrieval and feedback events |
| P0 | Product and launch-video claim audit | High | 2-3 days | Current feature inventory |
| P1 | Evaluation lab UI | Very high | 3-4 weeks | Evaluation harness |
| P1 | Versioning and draft/publish workflow | Very high | 2-3 weeks | Evaluation harness |
| P1 | Outcome analytics | High | 3 weeks | Conversation events |
| P1 | Inbox, routing, and SLA improvements | High | 3-4 weeks | Canonical conversation state |
| P1 | Guided setup and UX consolidation | High | 2-4 weeks | Draft/publish model |
| P2 | Shared action-execution framework | Very high | 4-6 weeks | Events, audit, versioning |
| P2 | Human approval workflows | Very high | 3-4 weeks | Action framework |
| P2 | Generic integration connector | High | 3-4 weeks | Secrets and action contracts |
| P2 | Production Shopify integration | High | 3-5 weeks | Connector and action framework |
| P2 | RBAC, audit, SSO, and enterprise controls | High | 4-6 weeks | Stable resource model |
| P3 | Slack, WhatsApp, Zendesk, and Discord | Medium-high | Per channel | Canonical channel adapter |
| P3 | Proactive support triggers | Medium-high | 4-6 weeks | Event and audience systems |
| P3 | Multilingual operation | Medium | 4-6 weeks | Multilingual evaluations |
| P3 | Voice support | Medium | 6-10 weeks | Mature text operations |
| P3 | Integration marketplace | Medium | 6+ weeks | Stable connector SDK |

## 5. P0: Immediate foundation

### 5.1 Canonical conversation and agent architecture

**Objective:** Ensure every production chat surface uses one execution path and one response contract.

Implementation tasks:

- Introduce a single conversation-service entry point.
- Route customer chat, embedded chat, test chat, and post-handoff continuation through it.
- Standardize the execution context:
  - `space_id`
  - `chatbot_id`
  - `session_id`
  - customer identity
  - channel
  - locale
- Standardize response events for text, citations, routing, tools, clarification, escalation, completion, and errors.
- Place legacy mock agents and mock data behind an explicit development flag.
- Document the canonical request lifecycle.

Primary code areas:

- `app/api/customer.py`
- `app/api/chat.py`
- `app/orchestra/ai/`
- `app/orchestra/ai/session/`
- `ui/src/lib/fetchSSE.ts`
- `ui/src/screens/CustomerChat.tsx`

Completion criteria:

- All production chat surfaces use the same orchestrator.
- Conversations retain context when ownership moves between AI and staff.
- Demo behavior cannot execute accidentally in production.

### 5.2 Durable conversation events and observability

**Objective:** Make every routing, retrieval, response, action, and handoff decision measurable and auditable.

Initial event types:

- `message.received`
- `triage.completed`
- `agent.selected`
- `retrieval.completed`
- `fact.used`
- `tool.started`
- `tool.completed`
- `clarification.requested`
- `answer.completed`
- `feedback.received`
- `escalation.started`
- `human.assigned`
- `conversation.resolved`
- `conversation.reopened`

Each event should include relevant tenant, chatbot, session, message, agent, model, latency, cost, source, and error fields. Sensitive tool inputs and outputs must be redacted before storage.

Completion criteria:

- A conversation can be reconstructed from stored events.
- Analytics does not rely on parsing application logs.
- Model, retrieval, and tool latency can be measured independently.

### 5.3 Automated test and CI baseline

**Objective:** Separate deterministic automated tests from live diagnostics and make critical checks blocking.

Implementation tasks:

- Create `tests/unit`, `tests/integration`, and `tests/e2e`.
- Move manual and live-service checks to `scripts/diagnostics`.
- Align the pytest configuration with the actual test directory.
- Mock model providers in default test runs.
- Add isolated PostgreSQL and Redis test configuration.
- Add CI stages for:
  - Python tests
  - Alembic migration validation
  - frontend type-check and build
  - Remotion lint and type-check
  - tenant-isolation security tests

Completion criteria:

- Default CI does not require external model credentials.
- Live-service tests are explicitly opt-in.
- Cross-space knowledge retrieval is covered by blocking tests.

### 5.4 Evaluation harness MVP

**Objective:** Detect regressions in routing, retrieval, answers, escalation, latency, and cost before release.

Suggested domain models:

- `EvaluationSuite`
- `EvaluationCase`
- `EvaluationRun`
- `EvaluationResult`

Each case should support:

- Question and optional conversation history
- Simulated customer attributes
- Expected and forbidden facts
- Expected agent and sources
- Expected action or escalation
- Latency and cost thresholds
- Deterministic and optional model-based graders

Implementation tasks:

- Add persistence and APIs for suites, cases, runs, and results.
- Add a headless runner against draft or published configurations.
- Seed at least 30 representative cases from existing product flows.
- Store failure explanations and execution traces.
- Add critical suites to CI or the publish gate.

Completion criteria:

- A new prompt, model, or KB configuration can be compared with production.
- Tenant-isolation and policy cases block publishing when they fail.
- Failures identify whether routing, retrieval, prompting, tools, or policy caused the problem.

### 5.5 Knowledge-health MVP

**Objective:** Convert retrieval failures and customer feedback into actionable knowledge improvements.

Initial issue types:

- Unanswered question
- Negative answer feedback
- No retrieval result
- Low retrieval confidence
- Missing citation
- Expired content
- Broken source URL
- Agent without an assigned knowledge base
- Document inaccessible to every agent
- Conflicting confirmed facts

Implementation tasks:

- Add a knowledge-issue model and detection jobs.
- Link each issue to conversations, documents, chunks, and agents.
- Add issue status, ownership, notes, and resolution history.
- Provide re-index and re-test actions.

Completion criteria:

- Owners can see and prioritize the most common unresolved questions.
- Every issue links to supporting evidence.
- Resolved issues can be regression-tested before closure.

### 5.6 Product and launch-video claim audit

**Objective:** Ensure public claims match production readiness.

Implementation tasks:

- Classify every advertised feature and integration as available, beta, demo, or planned.
- Update marketing copy and video scenes where claims exceed current behavior.
- Create a release checklist requiring claim verification.

## 6. P1: Productize trust and operations

### 6.1 Evaluation lab UI

Add `/app/evaluations` with the ability to:

- Create suites and cases manually.
- Generate cases from failed or poorly rated conversations.
- Import cases from CSV.
- Run against draft or production configuration.
- Compare prompts and models.
- Inspect routing, retrieval, facts, tools, latency, and cost.
- Save failures as permanent regression cases.

### 6.2 Configuration versioning and publishing

Version chatbot, agent, model, KB assignment, escalation, action, and branding configurations.

Lifecycle:

```text
Draft -> Validate -> Evaluate -> Approve -> Publish -> Monitor -> Roll back
```

Completion criteria:

- Form saves do not immediately mutate production behavior.
- Owners can review a configuration diff.
- A previous published version can be restored.

### 6.3 Outcome analytics

Standardize outcomes:

- AI resolved
- Action completed
- Escalated
- Abandoned
- Failed
- Reopened
- Spam

Initial metrics:

- Resolution, escalation, and reopen rates
- CSAT and answer feedback
- Cost per resolution
- Latency percentiles
- Knowledge coverage
- Outcomes by chatbot, agent, topic, model, and channel
- Highest-volume unresolved topics

Every aggregate metric must link to its supporting conversations.

### 6.4 Inbox, routing, and SLA improvements

Implement in this order:

1. SLA timers and breach warnings
2. Priority and skills-based assignment
3. Business-hours routing
4. Internal notes and mentions
5. Reply collision detection
6. Saved replies
7. AI summaries and suggested responses
8. Snooze and follow-up controls

An escalation should include the conversation summary, customer context, sources, attempted actions, and reason for escalation.

### 6.5 Guided setup and UX consolidation

Recommended setup flow:

```text
Identity -> Knowledge -> Agents -> Escalation -> Test -> Install
```

Add a global chatbot selector, readiness checklist, device previews, answer inspector, command search, and actionable empty/error states.

## 7. P2: Controlled automation

### 7.1 Shared action-execution framework

Every action must define:

- Input and output schemas
- Permission scope
- Validation rules
- Timeout and retry policy
- Idempotency key
- Dry-run behavior
- Risk classification
- Audit record
- User-visible confirmation
- Failure or compensation behavior

Initial actions:

- Look up an order
- Update a shipping address
- Cancel an eligible order
- Request a refund
- Issue store credit
- Update a CRM record
- Trigger a webhook

### 7.2 Human approval workflows

Approval rules should support monetary threshold, customer tier, action type, confidence, compliance category, assignee, and timeout behavior.

Lifecycle:

```text
Requested -> Assigned -> Approved/Rejected -> Executed/Failed
```

The AI should pause while approval is pending and resume with the decision context.

### 7.3 Generic integration connector

Support:

- REST APIs
- API key, bearer, basic, and OAuth authentication
- Header, query, and body mapping
- Encrypted secrets
- Test requests
- Response mapping
- Domain allowlists
- Rate limits, retries, and audit logs

Read-only knowledge sources and mutating actions must remain distinct concepts.

### 7.4 Production Shopify integration

Initial scope:

- Customer and order lookup
- Fulfillment status
- Cancellation eligibility
- Refund request
- Store credit or discount
- Product recommendations

All mutations must use the shared action and approval frameworks.

### 7.5 Enterprise controls

Implement role-based permissions, immutable audit history, SSO/SAML, session administration, retention policies, PII redaction, model-provider policies, space-level budgets, export, and erasure tooling.

## 8. P3: Future requirements

### 8.1 Omnichannel expansion

Recommended order:

1. Slack approvals and escalation
2. WhatsApp customer conversations
3. Zendesk synchronization
4. Discord
5. Email-native AI handling

Every channel must map into the canonical conversation-event and outcome models.

### 8.2 Proactive support

Potential triggers include checkout abandonment, repeated errors, payment failure, delivery delay, cancellation intent, rage clicks, and incident impact.

Prerequisites include audience targeting, consent, frequency caps, attribution, and stable event ingestion.

### 8.3 Multilingual operation

Add language detection, multilingual retrieval, translation, locale-specific tone, and localized handoff. Create multilingual evaluation suites before enabling each language in production.

### 8.4 Voice support

Treat voice as a separate program covering telephony, streaming transcription, interruption handling, latency, recording consent, QA, and human transfer.

### 8.5 Integration marketplace

Create a marketplace only after multiple first-party connectors demonstrate that authentication, action, permission, and audit contracts are stable.

## 9. Launch-video workstream

Immediate changes:

- Audit every feature claim against production readiness.
- Add the production URL and a QR code to the final CTA.
- Keep the CTA visible long enough to read and scan.
- Register `Beat1` through `Beat6` as a short composition or retire them after confirmation.

After P1:

- Replace isolated feature cards with an end-to-end customer-resolution story.
- Demonstrate retrieval, citations, escalation, approval, and outcome analytics.
- Produce 60-second, 30-second, and 15-second variants.
- Add narration, sound design, and scene transitions.

## 10. Release milestones

### Release A: Trustworthy Core

- Canonical conversation service
- Durable event tracking
- Automated CI and tenant-isolation tests
- Evaluation harness MVP
- Knowledge-health MVP

### Release B: Safe Publishing

- Evaluation lab UI
- Configuration versioning and rollback
- Outcome analytics
- Improved human inbox
- Guided setup experience

### Release C: Automated Resolution

- Shared action framework
- Human approvals
- Generic connector
- Shopify integration
- Audit and permission controls

### Release D: Platform Expansion

- Additional channels
- Proactive support
- Multilingual operation
- Voice
- Integration marketplace

## 11. Cross-cutting requirements

Every phase must maintain:

- Strict `space_id` and `chatbot_id` isolation
- Structured logging and durable audit history
- PII and secret redaction
- Accessible frontend behavior
- Backward-compatible migrations
- Feature flags for incomplete functionality
- Rollback procedures
- Updated API and user documentation
- Cost and latency budgets

## 12. Definition of done

A feature is complete only when:

- Its acceptance criteria are covered by automated tests.
- Tenant isolation and permissions are verified.
- Events, metrics, errors, and costs are observable.
- Empty, loading, success, and failure states are implemented.
- Migrations and rollback behavior are documented.
- User and API documentation are updated.
- The feature is gated appropriately until validated.
- Marketing claims match the released behavior.

## 13. Recommended first sprint

1. Decide and document the canonical production chat path.
2. Define the common execution context and event envelope.
3. Separate automated tests from live diagnostics.
4. Add tenant-isolation regression tests.
5. Implement storage for core conversation events.
6. Create the first ten critical evaluation cases.
7. Inventory every launch-video product claim.

The first sprint should not add a new channel or autonomous action. Its success criterion is a production conversation path that can be tested, traced, and trusted.

## 14. Implementation status

Started on 2026-08-29. The focused execution plan is documented in
`docs/superpowers/plans/2026-08-29-production-chat-foundation.md`.

Completed foundation slices:

- Production `/api/chat/*` paths share an immutable tenant, chatbot, and session execution context.
- Streaming, non-streaming, and warmup paths use one customer-executor construction seam.
- The legacy `/api/v1/chat` boundary is explicitly documented as demo-only.
- The append-only `conversation_events` model and Alembic migration are present.
- Initial message, answer, feedback, and escalation events are recorded without storing reply or reasoning content.
- Event recording uses an independent transaction and fails open when analytics persistence fails.
- Focused contract, runtime, event-recorder, and redaction tests are present under `tests/unit`.
- Tenant-scoped evaluation suites, cases, runs, and results are defined in migration `0044_evaluation_harness`.
- Deterministic graders cover expected agents, required/forbidden terms, sources, RAG, escalation, and latency.
- Authenticated `/api/v1/evaluations` endpoints support suite/case creation, manual result grading, and run history.
- Evaluation inputs reject reasoning fields and common credential-bearing context keys.
- A published-runtime headless runner executes up to 50 enabled cases sequentially with unique evaluation sessions.
- Live evaluation bypasses customer persistence and escalation workflows, disables clarification, and stores only normalized customer-visible outputs.
- Tenant-scoped run-result APIs expose deterministic checks without reasoning or raw tool payloads.
- `/app/evaluations` provides a responsive Evaluation Lab for creating chatbot-bound suites and deterministic cases.
- Owners can confirm and execute published-runtime suites, then inspect run history, answers, sources, latency, escalation intent, and individual checks.
- Evaluation UI navigation is registered for owners and the Super Admin visibility catalog, including compatibility with older saved navigation settings.

Remaining first-sprint work:

- Separate the existing live diagnostics from deterministic automated tests.
- Add database-backed tenant-isolation integration tests.
- Seed the first critical evaluation cases and add database-backed runner integration coverage.
- Add draft evaluation only after chatbot configuration versioning exists; move large suites to a worker queue.
- Add suite/case editing, structured history and customer-context inputs, CSV import, and publish gating after the corresponding APIs exist.
- Complete the launch-video claim inventory.
