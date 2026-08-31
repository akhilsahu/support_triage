# Data Source Tool Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, read-only REST tool runtime whose tools are assigned to real chatbot agents and are usable by both production orchestrators.

**Architecture:** Persist connections, tools, and agent assignments separately. Route every test and runtime call through `app/services/datasource`, expose management through a new `/api/v1/data-sources` router, and register only the tools authorized for the current space, chatbot, and specialist agent.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, SQLAlchemy async, Alembic, httpx, structlog, Agno, React 18, TypeScript, Vite, pytest.

**Spec:** `docs/superpowers/specs/2026-09-01-datasource-tool-registry-design.md`

## Global Constraints

- Application domain code lives under `app/services/datasource/`, not `app/utils/` and not a new top-level feature package.
- The first release permits `GET` and explicitly classified safe lookup-style `POST` tools only.
- Space identity always comes from authenticated execution context, never request payloads or model arguments.
- Credentials are encrypted at rest, write-only through APIs, and excluded from logs, diagnostics, model input, and responses.
- Every outbound execution revalidates URL, DNS result, and redirects and enforces timeout, byte, and record limits.
- AI-assisted cURL/OpenAPI import is Phase 2 and is not part of this runtime plan.
- Existing unrelated working-tree changes must not be staged or modified.

---

## File Structure

New files:

```text
app/api/v1/datasource_tools.py
app/models/datasource_connection.py
app/models/datasource_tool.py
app/models/agent_tool_assignment.py
app/schemas/datasource.py
app/services/datasource/__init__.py
app/services/datasource/contracts.py
app/services/datasource/validator.py
app/services/datasource/security.py
app/services/datasource/executor.py
app/services/datasource/registry.py
app/services/datasource/mapper.py
app/services/datasource/sanitizer.py
alembic/versions/0047_datasource_tool_registry.py
tests/unit/datasource/test_validator.py
tests/unit/datasource/test_mapper.py
tests/unit/datasource/test_sanitizer.py
tests/unit/datasource/test_security.py
tests/unit/datasource/test_executor.py
tests/unit/datasource/test_registry.py
tests/unit/api/test_datasource_tools_api.py
tests/unit/orchestra/test_agent_tool_scoping.py
ui/src/features/data-sources/api.ts
ui/src/features/data-sources/types.ts
ui/src/features/data-sources/DataSourceWizard.tsx
ui/src/features/data-sources/ConnectionStep.tsx
ui/src/features/data-sources/ToolReviewStep.tsx
ui/src/features/data-sources/AgentAssignmentStep.tsx
ui/src/features/data-sources/ActivationReviewStep.tsx
```

Modified files:

```text
app/main.py
app/models/__init__.py
app/models/space.py
app/orchestra/ai/contracts.py
app/orchestra/ai/customer_runtime.py
app/orchestra/ai/core/factory.py
app/orchestra/ai/core/config.py
app/orchestra/ai/factories/tools.py
app/orchestra/ai/factories/team.py
app/orchestra/ai/orchestrators/agno.py
app/orchestra/ai/session/pool.py
app/agents/dynamic_executor.py
app/mcp/datasource_server.py
ui/src/api/client.ts
ui/src/screens/DataSourceSetup.tsx
```

### Task 1: Persist connections, tools, assignments, and test runs

**Files:**
- Create: `app/models/datasource_connection.py`
- Create: `app/models/datasource_tool.py`
- Create: `app/models/agent_tool_assignment.py`
- Create: `alembic/versions/0047_datasource_tool_registry.py`
- Modify: `app/models/__init__.py`
- Modify: `app/models/space.py`
- Test: `tests/unit/models/test_datasource_tool_models.py`

**Interfaces:**
- Produces: `DataSourceConnection`, `DataSourceTool`, `AgentToolAssignment`, and `DataSourceTestRun` SQLAlchemy models.
- Produces: JSON properties named `default_headers`, `input_schema`, `request_template`, `output_mapping`, and `diagnostics`.

- [ ] **Step 1: Write model contract tests**

```python
def test_connection_dict_never_serializes_secret():
    connection = DataSourceConnection(name="Orders", auth_type="bearer", encrypted_secret="cipher")
    payload = connection.to_dict()
    assert "encrypted_secret" not in payload
    assert "secret" not in payload
    assert payload["credential_configured"] is True


def test_tool_json_properties_round_trip():
    tool = DataSourceTool(name="lookup_order")
    tool.input_schema = {"type": "object", "required": ["order_id"]}
    tool.request_template = {"query": {"id": "{order_id}"}}
    assert tool.input_schema["required"] == ["order_id"]
    assert tool.request_template["query"]["id"] == "{order_id}"
```

- [ ] **Step 2: Run the tests and verify missing model failures**

Run: `pytest tests/unit/models/test_datasource_tool_models.py -v`

Expected: FAIL because the new model modules do not exist.

- [ ] **Step 3: Implement the models and relationships**

Use UUID primary keys and indexed foreign keys. Required uniqueness constraints are:

```python
UniqueConstraint("space_id", "name", name="uq_datasource_connection_space_name")
UniqueConstraint("space_id", "name", name="uq_datasource_tool_space_name")
UniqueConstraint(
    "chatbot_id", "tool_id", "agent_kind", "agent_id",
    name="uq_agent_tool_assignment_target",
)
```

Store encrypted credentials only as `encrypted_secret: Text`. Store structured configuration using the repository's existing JSON-as-Text property pattern so SQLite unit tests and PostgreSQL production behave consistently.

- [ ] **Step 4: Add and inspect the migration**

Create the four tables and indexes. Migrate each legacy `space_data_sources` row into one connection and one `draft` tool; do not create assignments inside the schema migration because resolving chatbot-specific agents requires application relationships. Preserve legacy rows.

Run: `alembic upgrade head`

Expected: migration succeeds and all four tables exist.

- [ ] **Step 5: Run model tests**

Run: `pytest tests/unit/models/test_datasource_tool_models.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the persistence slice**

```bash
git add app/models app/models/space.py alembic/versions/0047_datasource_tool_registry.py tests/unit/models/test_datasource_tool_models.py
git commit -m "feat(datasource): add tool registry persistence"
```

### Task 2: Add framework-independent validation, mapping, and sanitization

**Files:**
- Create: `app/services/datasource/__init__.py`
- Create: `app/services/datasource/contracts.py`
- Create: `app/services/datasource/validator.py`
- Create: `app/services/datasource/mapper.py`
- Create: `app/services/datasource/sanitizer.py`
- Test: `tests/unit/datasource/test_validator.py`
- Test: `tests/unit/datasource/test_mapper.py`
- Test: `tests/unit/datasource/test_sanitizer.py`

**Interfaces:**
- Produces: `validate_tool_config(config: ToolConfig) -> None`.
- Produces: `map_response(payload: Any, record_path: str, field_mapping: dict[str, str], max_records: int) -> list[dict[str, Any]]`.
- Produces: `sanitize_mapping(value: Any, sensitive_keys: Collection[str] = ...) -> Any`.
- Produces: immutable `ToolConfig`, `ExecutionContext`, `ExecutionResult`, and `ExecutionFailure` dataclasses.

- [ ] **Step 1: Write validator tests**

```python
def test_validator_rejects_unbound_placeholder():
    config = tool_config(input_schema={"type": "object", "properties": {}}, path="/orders/{order_id}")
    with pytest.raises(ToolValidationError, match="order_id"):
        validate_tool_config(config)


def test_validator_rejects_write_method():
    with pytest.raises(ToolValidationError, match="read-only"):
        validate_tool_config(tool_config(method="DELETE"))
```

- [ ] **Step 2: Write mapper and sanitizer tests**

```python
def test_map_response_extracts_nested_records_and_projects_fields():
    payload = {"data": {"orders": [{"id": "A1", "state": "sent"}]}}
    assert map_response(payload, "data.orders", {"order_id": "id", "status": "state"}, 10) == [
        {"order_id": "A1", "status": "sent"}
    ]


def test_sanitizer_redacts_nested_credentials():
    value = {"headers": {"Authorization": "Bearer abc"}, "result": {"id": "A1"}}
    assert sanitize_mapping(value)["headers"]["Authorization"] == "[REDACTED]"
```

- [ ] **Step 3: Run focused tests and verify failures**

Run: `pytest tests/unit/datasource/test_validator.py tests/unit/datasource/test_mapper.py tests/unit/datasource/test_sanitizer.py -v`

Expected: FAIL because the service package does not exist.

- [ ] **Step 4: Implement the minimal pure functions and contracts**

Validate tool names with `^[a-z][a-z0-9_]{2,63}$`; require JSON Schema object roots; require every `{placeholder}` in path/query/body/header templates to be declared in `properties`; require all schema-required keys to exist in `properties`; allow only `GET` and safe `POST`; and cap `max_records` at 100.

`map_response` must support dot-separated dictionary paths, reject missing/non-list record paths with `ResponseMappingError`, treat a dictionary record as a single-item list, and truncate before projection.

- [ ] **Step 5: Run focused tests**

Run: `pytest tests/unit/datasource/test_validator.py tests/unit/datasource/test_mapper.py tests/unit/datasource/test_sanitizer.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the pure domain slice**

```bash
git add app/services/datasource tests/unit/datasource
git commit -m "feat(datasource): add validation and response mapping"
```

### Task 3: Centralize safe outbound execution

**Files:**
- Create: `app/services/datasource/security.py`
- Create: `app/services/datasource/executor.py`
- Test: `tests/unit/datasource/test_security.py`
- Test: `tests/unit/datasource/test_executor.py`

**Interfaces:**
- Consumes: `ToolConfig`, `ExecutionContext`, `ExecutionResult`, `validate_tool_config`, `map_response`, and `sanitize_mapping` from Task 2.
- Produces: `validate_destination(url: str) -> ValidatedDestination`.
- Produces: `DataSourceExecutor.execute(config: ToolConfig, arguments: dict[str, Any], context: ExecutionContext) -> ExecutionResult`.

- [ ] **Step 1: Write destination-policy tests**

```python
@pytest.mark.parametrize("url", [
    "http://127.0.0.1/a", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd"
])
def test_validate_destination_rejects_unsafe_targets(url):
    with pytest.raises(UnsafeDestinationError):
        validate_destination(url)
```

Patch `socket.getaddrinfo` to prove that any private result among multiple A/AAAA records rejects the destination.

- [ ] **Step 2: Write executor tests with `httpx.MockTransport`**

Cover placeholder substitution, encrypted-secret decryption at call time, forbidden headers, byte limits, timeout categorization, redirect revalidation, non-JSON responses, record mapping, and sanitized errors. Assert the model-facing result never includes request headers or secrets.

- [ ] **Step 3: Run the tests and verify failures**

Run: `pytest tests/unit/datasource/test_security.py tests/unit/datasource/test_executor.py -v`

Expected: FAIL because the executor and policy are absent.

- [ ] **Step 4: Implement destination validation and the executor**

Use `httpx.AsyncClient(follow_redirects=False)` and process at most three redirects manually, validating each `Location` before following it. Use explicit connect/read/write/pool timeouts, stream response bytes, stop at the configured maximum, parse JSON only after the size check, and map failures to stable codes:

```python
DNS_ERROR = "dns_error"
UNSAFE_DESTINATION = "unsafe_destination"
AUTHENTICATION_FAILED = "authentication_failed"
UPSTREAM_TIMEOUT = "upstream_timeout"
UPSTREAM_ERROR = "upstream_error"
RESPONSE_TOO_LARGE = "response_too_large"
INVALID_RESPONSE = "invalid_response"
```

- [ ] **Step 5: Run focused tests**

Run: `pytest tests/unit/datasource/test_security.py tests/unit/datasource/test_executor.py -v`

Expected: PASS.

- [ ] **Step 6: Commit execution security**

```bash
git add app/services/datasource/security.py app/services/datasource/executor.py tests/unit/datasource/test_security.py tests/unit/datasource/test_executor.py
git commit -m "feat(datasource): add secure REST tool executor"
```

### Task 4: Build the tenant- and agent-scoped registry

**Files:**
- Create: `app/services/datasource/registry.py`
- Test: `tests/unit/datasource/test_registry.py`

**Interfaces:**
- Consumes: Task 1 models and `DataSourceExecutor`.
- Produces: `DataSourceToolRegistry(db: AsyncSession, executor: DataSourceExecutor | None = None)`.
- Produces: `list_tools(context: ExecutionContext, agent_id: UUID, agent_kind: str) -> list[ToolDefinition]`.
- Produces: `execute(context: ExecutionContext, agent_id: UUID, agent_kind: str, tool_id: UUID, arguments: dict[str, Any]) -> ExecutionResult`.

- [ ] **Step 1: Write authorization tests**

Create fixtures for two spaces, two chatbots, active/inactive agents, two tools assigned to one agent, and one tool assigned to two agents. Assert discovery and execution exclude inactive, unassigned, cross-chatbot, and cross-space rows.

- [ ] **Step 2: Write collision and stale-revision tests**

Assert definitions use `lookup_order_<8-char-id>` names and that executing a disabled or changed revision from a stale definition returns `tool_unavailable` before the external executor is called.

- [ ] **Step 3: Run registry tests and verify failures**

Run: `pytest tests/unit/datasource/test_registry.py -v`

Expected: FAIL because `DataSourceToolRegistry` is missing.

- [ ] **Step 4: Implement registry queries and dispatch**

Load assignments with their tool and connection in one SQLAlchemy query. Recheck every ownership/status/assignment predicate in `execute`; do not rely on a prior `list_tools` call. Convert each tool to an OpenAI-compatible definition with `tool_id` and `revision` retained as application metadata.

- [ ] **Step 5: Run registry tests**

Run: `pytest tests/unit/datasource/test_registry.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the registry**

```bash
git add app/services/datasource/registry.py tests/unit/datasource/test_registry.py
git commit -m "feat(datasource): add agent-scoped tool registry"
```

### Task 5: Expose management and testing APIs

**Files:**
- Create: `app/schemas/datasource.py`
- Create: `app/api/v1/datasource_tools.py`
- Modify: `app/main.py`
- Test: `tests/unit/api/test_datasource_tools_api.py`

**Interfaces:**
- Consumes: Task 1 models and Task 2-4 services.
- Produces: `/api/v1/data-sources/connections`, `/tools`, `/tools/{id}/assignments`, and `/tools/{id}/execute-test` contracts from the spec.

- [ ] **Step 1: Write API ownership and secret tests**

Use dependency overrides for `current_space` and `get_db`. Assert a create response contains `credential_configured` but not the supplied secret, cross-space IDs return 404, and listing never exposes encrypted values.

- [ ] **Step 2: Write activation and assignment tests**

Assert assignment accepts active built-in/custom agents belonging to the selected chatbot, rejects triage and inactive/cross-space agents, replaces assignments transactionally, and rejects activation until the current revision has a successful test run.

- [ ] **Step 3: Run API tests and verify failures**

Run: `pytest tests/unit/api/test_datasource_tools_api.py -v`

Expected: FAIL because the router is absent.

- [ ] **Step 4: Implement schemas, router, and registration**

Use `Field(default_factory=dict/list)` rather than mutable Pydantic defaults. Encrypt incoming secrets with `app.core.encryption.encrypt`; omit the field on update to retain the existing secret. After successful mutations, call a small post-commit invalidation hook with `space_id` and affected `chatbot_ids`.

- [ ] **Step 5: Run API and model tests**

Run: `pytest tests/unit/api/test_datasource_tools_api.py tests/unit/models/test_datasource_tool_models.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the API slice**

```bash
git add app/schemas/datasource.py app/api/v1/datasource_tools.py app/main.py tests/unit/api/test_datasource_tools_api.py
git commit -m "feat(datasource): add tool management API"
```

### Task 6: Wire tools into production orchestrators

**Files:**
- Modify: `app/orchestra/ai/contracts.py`
- Modify: `app/orchestra/ai/customer_runtime.py`
- Modify: `app/orchestra/ai/core/factory.py`
- Modify: `app/orchestra/ai/core/config.py`
- Modify: `app/orchestra/ai/factories/tools.py`
- Modify: `app/orchestra/ai/factories/team.py`
- Modify: `app/orchestra/ai/orchestrators/agno.py`
- Modify: `app/orchestra/ai/session/pool.py`
- Modify: `app/agents/dynamic_executor.py`
- Modify: `app/mcp/datasource_server.py`
- Test: `tests/unit/orchestra/test_agent_tool_scoping.py`
- Test: `tests/unit/orchestra/test_customer_runtime.py`

**Interfaces:**
- Consumes: `DataSourceToolRegistry` and `ExecutionContext`.
- Produces: an async registry loader passed through `build_customer_executor` and `build_executor`.
- Produces: `invalidate_datasource_runners(space_id: str, chatbot_ids: Collection[str]) -> None`.

- [ ] **Step 1: Extend runtime forwarding tests**

Assert production context forwards the application DB session or registry provider needed to build tools, while evaluation context continues to disable external tools.

- [ ] **Step 2: Write per-agent factory tests**

```python
async def test_team_factory_gives_each_specialist_only_assigned_tools():
    tools = await build_tools_by_agent(registry, context, [logistics, finance])
    assert [t.name for t in tools[logistics.id]] == ["track_order_ab12cd34"]
    assert tools[finance.id] == []
```

Also assert Dynamic invokes the model's native function-call loop, validates the returned tool name against the selected agent's definitions, executes once, appends the structured result, and limits the loop to three calls.

- [ ] **Step 3: Run orchestra tests and verify failures**

Run: `pytest tests/unit/orchestra/test_agent_tool_scoping.py tests/unit/orchestra/test_customer_runtime.py -v`

Expected: FAIL because runtime registry wiring is missing.

- [ ] **Step 4: Implement runtime wiring**

Enable tools in production config without enabling them in evaluation. Build agent-specific Agno tool lists rather than one shared list. Replace `DataSourceMCPServer` internals with a compatibility adapter that delegates list/call operations to the registry. Keep no duplicate HTTP request logic in `app/mcp`.

- [ ] **Step 5: Implement cache invalidation**

Add an explicit pool method that evicts the affected production runner keys. Call it after post-commit data source mutations; retain TTL as fallback and log invalidation failures with space/chatbot context.

- [ ] **Step 6: Run all orchestra and datasource tests**

Run: `pytest tests/unit/orchestra tests/unit/datasource tests/unit/api/test_datasource_tools_api.py -v`

Expected: PASS.

- [ ] **Step 7: Commit runtime integration**

```bash
git add app/orchestra app/agents/dynamic_executor.py app/mcp/datasource_server.py tests/unit/orchestra
git commit -m "feat(datasource): expose assigned tools to agent runtimes"
```

### Task 7: Replace the dead-agent form with the Phase 1 wizard

**Files:**
- Create: `ui/src/features/data-sources/api.ts`
- Create: `ui/src/features/data-sources/types.ts`
- Create: `ui/src/features/data-sources/DataSourceWizard.tsx`
- Create: `ui/src/features/data-sources/ConnectionStep.tsx`
- Create: `ui/src/features/data-sources/ToolReviewStep.tsx`
- Create: `ui/src/features/data-sources/AgentAssignmentStep.tsx`
- Create: `ui/src/features/data-sources/ActivationReviewStep.tsx`
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/screens/DataSourceSetup.tsx`
- Test: `ui/src/features/data-sources/DataSourceWizard.test.tsx`

**Interfaces:**
- Consumes: new API contracts and existing `apiClient.listSpaceAgents(chatbotId)` behavior.
- Produces: a screen wrapper that lists connections/tools and opens the four-step Phase 1 wizard: Connect, Review Tool, Assign Agents, Test & Activate.

- [ ] **Step 1: Add frontend contract and selector tests**

Mock two active specialists, one inactive specialist, triage, and one custom agent. Assert the selector offers the two active specialists plus the active custom agent, excludes triage, places inactive agents in a disabled informational group, and submits stable IDs plus `agent_kind`.

- [ ] **Step 2: Add wizard behavior tests**

Assert secrets never appear in the review payload, advanced request fields are collapsed initially, failed tests preserve form state, activation stays disabled until a successful current-revision test, and editing after a test requires retesting.

- [ ] **Step 3: Run tests and verify failures**

Run: `cd ui && npm test -- --run src/features/data-sources/DataSourceWizard.test.tsx`

Expected: FAIL because the feature components are absent.

- [ ] **Step 4: Implement typed API helpers and focused components**

Keep `DataSourceSetup.tsx` responsible only for list/loading/navigation state. Fetch agents from the backend using the current chatbot ID; remove `BUILTIN_AGENTS` from the assignment path. Use one state object typed as `DataSourceDraft` and reset test status whenever connection or tool fields change.

- [ ] **Step 5: Run frontend tests, typecheck, and lint**

Run: `cd ui && npm test -- --run src/features/data-sources/DataSourceWizard.test.tsx`

Run: `cd ui && npm run build`

Expected: tests and TypeScript build PASS.

- [ ] **Step 6: Commit the UI slice**

```bash
git add ui/src/features/data-sources ui/src/api/client.ts ui/src/screens/DataSourceSetup.tsx
git commit -m "feat(ui): add agent-scoped data source wizard"
```

### Task 8: Complete migration review and end-to-end verification

**Files:**
- Modify: `app/api/v1/datasources.py`
- Modify: `app/models/datasource.py`
- Create: `tests/integration/test_datasource_agent_flow.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: legacy compatibility behavior, migration-review visibility, and a verified UI-to-agent flow.

- [ ] **Step 1: Write the integration test**

Create a space, chatbot, custom or built-in specialist, connection, tool, assignment, and successful mock upstream response. Send a customer message, assert the selected specialist calls the assigned tool, and assert the final response includes mapped data without credentials. Add a second-space negative case.

- [ ] **Step 2: Run the test and verify any compatibility failures**

Run: `pytest tests/integration/test_datasource_agent_flow.py -v`

Expected: the first run may expose missing legacy delegation or lifecycle wiring; it must not be skipped.

- [ ] **Step 3: Add the legacy compatibility layer**

Keep legacy list responses readable. Reject new legacy creates with a documented migration response once the new UI is active, or translate them transactionally into one connection plus one draft tool. Do not maintain two independent runtime execution paths.

- [ ] **Step 4: Document operation and migration review**

Update the README Data Sources section with the new entities, endpoint prefix, read-only limitation, migration-draft behavior, credential policy, runtime feature flag, and commands for testing.

- [ ] **Step 5: Run the full verification set**

Run: `pytest tests/unit/models/test_datasource_tool_models.py tests/unit/datasource tests/unit/api/test_datasource_tools_api.py tests/unit/orchestra tests/integration/test_datasource_agent_flow.py -v`

Run: `cd ui && npm test -- --run src/features/data-sources/DataSourceWizard.test.tsx`

Run: `cd ui && npm run build`

Run: `git diff --check`

Expected: all tests/builds pass and no whitespace errors are reported.

- [ ] **Step 6: Commit compatibility and verification**

```bash
git add app/api/v1/datasources.py app/models/datasource.py tests/integration/test_datasource_agent_flow.py README.md
git commit -m "test(datasource): verify end-to-end tool execution"
```

## Phase 2 Follow-up Plan

After Phase 1 is deployed and verified, create a separate plan for
`app/services/datasource/importer.py`, `analyzer.py`, cURL/OpenAPI import,
deterministic structure inference, shared-LLM semantic suggestions, and the
five-step assisted onboarding experience. Phase 2 must consume the stable
connection/tool APIs created here rather than changing runtime execution.
