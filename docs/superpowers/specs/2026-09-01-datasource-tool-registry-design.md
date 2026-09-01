# Data Source Tool Registry Design

## Summary

Replace the current order-specific, agent-type-bound data source prototype with
a space-scoped tool registry. A connection stores transport and credentials, a
tool defines one callable API operation, and an assignment controls which real
chatbot agents may use that tool. The registry is the canonical runtime; an MCP
adapter may expose it without duplicating request execution.

The first release supports read-only REST lookup tools. It also replaces the
static **Target Fleet Agent** dropdown with active built-in and custom agents
from the selected chatbot. AI assists import and mapping, but every suggestion
is validated and reviewed before activation.

## Goals

- Make configured data sources available to both production orchestrators.
- Bind tools to stable chatbot agent identities rather than generic agent types.
- Support several tools per connection and several tools per agent.
- Give non-technical users a short import, test, review, assign, activate flow.
- Support arbitrary lookup schemas instead of only canonical order fields.
- Centralize execution, tenancy, security, sanitization, and audit behavior.
- Keep the runtime compatible with OpenAI function tools, Agno tools, and a
  future standard MCP transport.
- Preserve existing saved data sources during a controlled migration.

## Non-goals

- General workflow automation or multi-step tool composition.
- Autonomous write actions such as refunds, cancellations, or ticket creation.
- A standalone MCP deployment in the first release.
- OAuth provider marketplaces or provider-specific connector catalogs.
- Arbitrary scripting or transformation code supplied by users.
- Guaranteed automatic interpretation of every undocumented API.

## Current Problems

The UI builds the target dropdown from a static frontend catalog. It therefore
shows disabled built-ins, omits custom agents, ignores the selected chatbot,
and can drift from backend state. Saved rows use `agent_type`, which is neither
a unique nor stable agent identity.

The current data model and probe prompt normalize every response into canonical
order fields. `DataSourceMCPServer` stores one source per agent type, so a later
source silently replaces an earlier source targeting the same type. Although
tool conversion code exists, the production executor factory passes no MCP
server and Agno tools are disabled. Configuration therefore does not form a
complete UI-to-runtime path.

Request execution is duplicated between the API and MCP modules, and runtime
execution does not consistently apply the probe endpoint's outbound URL
protections. The new registry removes those divergent paths.

## Domain Model

### Connection

A connection owns reusable transport configuration:

- `id`, `space_id`, `name`, and `status`;
- `base_url` and default headers;
- authentication type, encrypted secret, and authentication metadata;
- timestamps and last health-check summary.

Credentials are write-only through the API. Responses expose only whether a
credential is configured and a safe authentication label.

### Tool

A tool owns one operation on a connection:

- unique machine name within a space;
- user-facing name and LLM-facing description;
- HTTP method and URL path/template;
- input JSON Schema;
- request parameter, header, and body templates;
- response record path and optional field selection/renaming;
- maximum records and maximum response bytes;
- `draft`, `active`, or `disabled` status;
- `read` or `write` risk classification.

The first release permits `GET` and explicitly classified safe lookup-style
`POST` operations. Other write methods remain drafts and cannot execute.

### Assignment

An assignment joins a tool to one concrete chatbot agent:

- `space_id`, `chatbot_id`, `tool_id`;
- agent kind (`builtin` or `custom`) and stable agent configuration ID;
- enabled state and timestamps.

The API verifies that the chatbot and agent belong to the authenticated space.
Triage is excluded from normal assignment because it routes requests rather
than handling domain operations.

### Test Run

A test run records sanitized diagnostics:

- connection/tool, outcome, latency, status code, and timestamp;
- redacted request summary and bounded response preview;
- stable failure category and actionable message.

Raw credentials and complete customer responses are never persisted in test
run records.

## Package Layout

```text
app/
├── api/v1/
│   └── datasource_tools.py
├── services/datasource/
│   ├── __init__.py
│   ├── contracts.py
│   ├── importer.py
│   ├── analyzer.py
│   ├── validator.py
│   ├── security.py
│   ├── executor.py
│   ├── registry.py
│   ├── mapper.py
│   └── sanitizer.py
├── schemas/
│   └── datasource.py
└── models/
    ├── datasource_connection.py
    ├── datasource_tool.py
    └── agent_tool_assignment.py
```

The API module handles authentication, HTTP contracts, transactions, and
status codes. `app/services/datasource` contains framework-independent domain
logic. Pydantic request/response types live in `schemas`; persistence stays in
`models`. Service modules do not import FastAPI request objects.

### Utility responsibilities

- `contracts.py`: internal draft, execution, and result types.
- `importer.py`: deterministic cURL and OpenAPI operation import.
- `analyzer.py`: structural analysis plus validated LLM suggestions.
- `validator.py`: tool names, schemas, templates, assignments, and risk rules.
- `security.py`: URL/DNS/redirect checks and outbound request policy.
- `executor.py`: authorized request construction and external HTTP execution.
- `registry.py`: agent-scoped discovery, tool definitions, and dispatch.
- `mapper.py`: nested record extraction and output projection.
- `sanitizer.py`: secret redaction and bounded previews/log fields.

`executor.py` is the only module that calls configured external APIs at
runtime. Probe, test, agent, and MCP paths all delegate to it.

## API Contract

Register `datasource_tools.py` under `/api/v1/data-sources`:

```text
POST   /import
POST   /analyze
POST   /test

GET    /connections
POST   /connections
GET    /connections/{connection_id}
PATCH  /connections/{connection_id}
DELETE /connections/{connection_id}

GET    /tools
POST   /tools
PATCH  /tools/{tool_id}
DELETE /tools/{tool_id}
PUT    /tools/{tool_id}/assignments
POST   /tools/{tool_id}/execute-test
```

List endpoints accept `chatbot_id` where chatbot scope affects their result.
Mutations reject cross-space identifiers. Deletes return `409` when dependent
objects require an explicit cascade choice. Activation requires a successful
test against the current tool revision.

`POST /import` accepts exactly one of a cURL string, OpenAPI document, or URL.
Remote OpenAPI URL fetching follows the same outbound safety policy as tool
execution. Import returns drafts and never stores or activates them.

`POST /analyze` accepts a bounded sanitized sample and draft operation. It
returns suggestions with confidence and warnings. It never returns invented
sample fields or changes persisted configuration.

The legacy `/api/v1/datasources` router remains during migration. It delegates
shared work to the new package where possible and is removed only after the
new UI and migrated records have been stable for one release cycle.

## User Experience

The Data Sources page retains its list view and opens a five-step wizard.

### 1. Import API

The user pastes a cURL command, uploads/pastes OpenAPI, or enters an endpoint.
The importer prefills the URL, method, non-secret headers, inputs, and body.
Secrets are displayed only in dedicated password fields.

### 2. Connect and test

The user selects authentication and supplies credentials. The system performs
a bounded request and shows connection status, latency, and a sanitized sample.
A failure preserves the form and gives an actionable category such as DNS,
authentication, timeout, schema, or upstream response error.

### 3. Review tool

The default view shows the tool's name, plain-language purpose, required inputs,
and representative output. Advanced settings reveal headers, templates, record
path, and field projection. Order lookup may be offered as a template, but the
storage and UI are generic.

### 4. Assign agents

The UI loads agents from the existing space-agent API for the selected chatbot.
Active built-in and custom specialists are selectable. Inactive agents appear
only in a collapsed informational group and cannot receive new assignments.
The analyzer may recommend agents from their descriptions and capabilities;
the user must confirm each assignment.

Existing assignments to an agent that later becomes inactive remain visible
with a warning but are ignored by runtime discovery.

### 5. Activate

The UI runs a test question, displays the proposed tool and sanitized arguments,
executes the tool, and previews the bounded result. The user may activate after
success or save a draft. AI suggestions never activate a tool automatically.

The implementation lives under `ui/src/features/data-sources/`; the existing
screen becomes a small route-level wrapper. Raw JSON and placeholder syntax
remain behind Advanced settings.

## AI-Assisted Configuration

Configuration follows a deterministic-first pipeline:

1. Parse cURL or OpenAPI without an LLM.
2. Inspect response structure and candidate record arrays.
3. Infer exact and common-name matches with local rules.
4. Use the shared LLM provider service only for ambiguous descriptions,
   mappings, record paths, and assignment recommendations.
5. Validate every suggestion against the imported request and observed sample.
6. Return suggestions for explicit review.

The analyzer sends only a bounded, sanitized sample to the model. It does not
send authentication values or sensitive headers. If the LLM is unavailable,
the deterministic flow remains usable and the user can complete fields
manually.

## Runtime Architecture

`DataSourceToolRegistry` is the canonical application runtime:

```text
list_tools(space_id, chatbot_id, agent_identity)
execute(execution_context, tool_id, arguments)
```

`list_tools` returns only active, assigned tools whose connection is active and
whose agent is active for the chatbot. Tool names contain a stable short ID to
avoid collisions while retaining a readable prefix.

`execute` re-authorizes the tool against the supplied space, chatbot, and agent
context before resolving any secret or making a request. It validates arguments
against the input schema, executes through `executor.py`, maps the result, and
returns a structured bounded value. Knowing a tool ID is insufficient to call
an unassigned or cross-tenant tool.

The production executor factory loads the registry rather than passing
`mcp_server=None`. The Dynamic backend receives native function definitions.
The Agno factory builds tools per specialist instead of sharing a global list.
The evaluation runtime keeps external tools disabled by default; a later
explicit evaluation mode may enable mocked or allowlisted tool fixtures.

### MCP adapter

The current `DataSourceMCPServer` becomes `DataSourceMCPAdapter` or a thin
compatibility wrapper. It translates MCP list/call operations to the registry
and contains no HTTP execution, credential, mapping, or tenancy logic. A
separate network MCP process is not deployed in the first release.

### Cache invalidation

Agno runners are cached. Successful connection, tool, assignment, or relevant
agent activation mutations invalidate runners for the affected space and
chatbot. Invalidation is part of the mutation transaction's post-commit path;
failure is logged and the short runner TTL remains a fallback. Tool revisions
also prevent a stale runner from executing a changed or disabled definition.

## Security and Reliability

- Derive space identity from authentication, never from request bodies.
- Encrypt credentials at rest and never serialize decrypted values.
- Revalidate the resolved destination for every execution and every redirect.
- Reject loopback, link-local, private, metadata, and disallowed address ranges.
- Use a restricted redirect count and reject scheme or destination changes that
  fail validation, mitigating DNS rebinding and redirect-based SSRF.
- Restrict user-controlled headers such as `Host`, forwarding headers, and
  hop-by-hop headers.
- Enforce connect/read/total timeouts, response byte limits, record limits, and
  per-space concurrency/rate limits.
- Verify TLS and do not expose a user-facing disable-verification option.
- Production deployment must enforce an outbound firewall or proxy that blocks
  private, loopback, link-local, and cloud metadata ranges. HTTPX 0.28 has no
  supported per-request resolved-IP pinning hook, so application DNS checks and
  network egress policy jointly mitigate the remaining DNS-rebinding race.
- Redact secrets and sensitive headers from logs, diagnostics, and model input.
- Treat tool results as untrusted data and clearly delimit them in prompts.
- Permit only read-classified operations in the first release.
- Return stable error categories to agents; do not include raw upstream bodies
  or internal exceptions in customer responses.

Structured audit events include space, chatbot, agent, tool, outcome, duration,
and bounded counts. They exclude secrets, full request bodies, and full results.

## Migration

Add an Alembic revision named `0047_datasource_tool_registry.py` creating:

- `data_source_connections`;
- `data_source_tools`;
- `agent_tool_assignments`;
- `data_source_test_runs`.

For each existing `space_data_sources` row, create one connection and one draft
lookup tool. Convert the existing field mapping to an output projection and the
stored placeholders to an input schema. When exactly one real active agent can
be resolved from `agent_type`, create its assignment. Otherwise keep the tool
as a disabled draft with a migration warning for administrator review. The
migration never guesses between multiple matching chatbot agents.

Legacy rows remain intact through the compatibility period. New writes use the
new tables only after the new UI is enabled. Rollback disables the new feature
and preserves legacy data; it cannot attempt to squeeze multiple generic tools
back into the old one-row-per-source representation.

## Files Changed

New backend files are the package, endpoint, schemas, models, and migration
listed above. Existing backend integration points include:

```text
app/main.py
app/models/__init__.py
app/models/space.py
app/orchestra/ai/core/factory.py
app/orchestra/ai/core/config.py
app/orchestra/ai/factories/tools.py
app/orchestra/ai/factories/team.py
app/orchestra/ai/session/pool.py
app/agents/dynamic_executor.py
app/mcp/datasource_server.py
app/services/evaluation_runner.py
```

New frontend files live under:

```text
ui/src/features/data-sources/
├── api.ts
├── types.ts
├── DataSourceWizard.tsx
├── ConnectionImportStep.tsx
├── ConnectionTestStep.tsx
├── ToolReviewStep.tsx
├── AgentAssignmentStep.tsx
├── ActivationReviewStep.tsx
├── AdvancedRequestEditor.tsx
├── ResponseMappingEditor.tsx
├── DataSourceCard.tsx
└── DataSourceHealthBadge.tsx
```

Existing frontend integration points are `DataSourceSetup.tsx`, `Agents.tsx`,
`api/client.ts`, and `App.tsx`.

## Testing

Unit coverage is organized under `tests/unit/datasource` for importer,
analyzer, validator, security, executor, mapper, sanitizer, and registry. API
tests cover tenant isolation, credential write-only behavior, validation,
activation gates, assignments, and delete conflicts. Orchestra tests verify
per-agent tool visibility, Dynamic and Agno registration, execution context,
and runner invalidation.

An integration test covers import through activation and a customer request
that invokes the configured tool. Security fixtures cover private addresses,
redirects, DNS changes, forbidden headers, oversized responses, invalid JSON,
timeouts, and upstream authentication errors.

Acceptance criteria:

- The target selector shows active agents from the selected chatbot, including
  custom agents, and does not offer inactive agents for new assignment.
- Two tools can target one agent and one tool can target several agents.
- Unassigned and cross-tenant agents cannot discover or execute a tool.
- Credentials never appear in responses, logs, stored diagnostics, or LLM
  input.
- Configuration changes become visible without waiting for cache expiry.
- Both production orchestrators can invoke an assigned active tool.
- Runtime failures yield safe, actionable agent behavior.
- Existing source rows migrate without data loss or unsafe activation.

## Delivery Phases

### Phase 1: Safe functional runtime

Create the schema and utility package, migrate legacy rows as drafts, implement
read-only REST tools, replace the dead-agent selector, add agent-scoped runtime
wiring, and apply security and audit controls.

### Phase 2: Assisted onboarding

Add cURL and OpenAPI import, deterministic response analysis, optional LLM
suggestions, the five-step wizard, health status, and test-question preview.

### Phase 3: Extended integrations

Expose the registry through standard MCP transport, add OAuth/provider
connectors, and design separately approved write actions with confirmation and
authorization policies.

## Key Decisions

- Use an in-process registry as the source of truth; MCP is an adapter.
- Store connections, tools, and agent assignments independently.
- Reference real chatbot agent identities, not `agent_type` strings.
- Keep configuration generic; order lookup is only an optional template.
- Use deterministic parsing before optional LLM assistance.
- Require explicit review, a successful current-revision test, and manual
  activation.
- Ship read-only operations before any consequential write tools.
