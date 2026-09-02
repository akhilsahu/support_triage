# Data Source Feature Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a distinct global/per-space Data Sources capability and let users plug active datasource tools into agents from the Agent page.

**Architecture:** A single backend availability policy resolves the platform master flag and nullable space override. The policy gates management APIs and runtime discovery; the dashboard exposes the effective result to route, menu, and Agent-page UI. A new agent-centric assignment endpoint performs atomic multi-tool replacement without disturbing other agents.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, Alembic, Pydantic, React 19, TypeScript, Zustand, React Router, Tailwind CSS, pytest, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-datasource-feature-control-design.md`

## Global Constraints

- The Data Sources capability switch is distinct from navigation configuration.
- Effective capability is `platform_enabled AND (space override is NULL or true)`.
- A space can disable the feature but cannot bypass a disabled platform master switch.
- The migration defaults the platform master switch to enabled and space overrides to inherited.
- Disabling the feature never deletes datasource configuration, tests, or assignments.
- Stored credentials and hidden header values must never be exposed in new responses.
- Agent assignment must reject triage, cross-space, cross-chatbot, inactive agents, inactive tools, and duplicate tool IDs.
- Assignment replacement changes only the selected agent's rows and preserves every other agent's assignments.

---

### Task 1: Persist and resolve datasource capability

**Files:**
- Create: `alembic/versions/0050_datasource_feature_control.py`
- Create: `app/services/datasource/availability.py`
- Modify: `app/models/space.py`
- Test: `tests/services/datasource/test_availability.py`

**Interfaces:**
- Produces: `async def datasource_feature_enabled(db: AsyncSession, space: Space) -> bool`
- Produces: `async def require_datasource_feature(space: Space = Depends(current_space), db: AsyncSession = Depends(get_db)) -> Space`
- The dependency raises HTTP 403 with detail `Data Sources has been disabled by an administrator.`

- [ ] **Step 1: Write the failing availability tests**

Create unit tests using lightweight objects and a mocked scalar result:

```python
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("platform", "override", "expected"),
    [(True, None, True), (True, True, True), (True, False, False),
     (False, None, False), (False, True, False), (False, False, False)],
)
async def test_datasource_feature_resolution(platform, override, expected):
    db = AsyncMock()
    db.scalar.return_value = SimpleNamespace(datasources_platform_enabled=platform)
    space = SimpleNamespace(datasources_enabled=override)
    assert await datasource_feature_enabled(db, space) is expected

@pytest.mark.asyncio
async def test_dependency_rejects_disabled_feature():
    db = AsyncMock()
    db.scalar.return_value = SimpleNamespace(datasources_platform_enabled=False)
    with pytest.raises(HTTPException) as exc:
        await require_datasource_feature(SimpleNamespace(datasources_enabled=True), db)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Data Sources has been disabled by an administrator."
```

- [ ] **Step 2: Run the tests and confirm the missing module failure**

Run: `.venv/bin/pytest tests/services/datasource/test_availability.py -q`

Expected: FAIL because `app.services.datasource.availability` does not exist.

- [ ] **Step 3: Add model fields and the focused availability policy**

Add nullable `Space.datasources_enabled`, non-null `PlatformSettings.datasources_platform_enabled`, and:

```python
DISABLED_DETAIL = "Data Sources has been disabled by an administrator."

async def datasource_feature_enabled(db: AsyncSession, space: Space) -> bool:
    settings = await db.scalar(select(PlatformSettings).limit(1))
    platform_enabled = True if settings is None else bool(settings.datasources_platform_enabled)
    return platform_enabled and space.datasources_enabled is not False

async def require_datasource_feature(
    space: Space = Depends(current_space),
    db: AsyncSession = Depends(get_db),
) -> Space:
    if not await datasource_feature_enabled(db, space):
        raise HTTPException(status_code=403, detail=DISABLED_DETAIL)
    return space
```

The migration uses revision `0050_datasource_feature_control`, down revision `fb1871f37217`, adds `spaces.datasources_enabled` as nullable Boolean, and adds `platform_settings.datasources_platform_enabled` as non-null Boolean with server default `true`. Downgrade removes both columns.

- [ ] **Step 4: Run migration and policy checks**

Run:

```bash
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/services/datasource/test_availability.py -q
```

Expected: migration succeeds and all six truth-table cases plus dependency rejection pass.

- [ ] **Step 5: Commit the persistence and policy increment**

```bash
git add alembic/versions/0050_datasource_feature_control.py app/models/space.py app/services/datasource/availability.py tests/services/datasource/test_availability.py
git commit -m "feat(datasource): add two-level feature availability"
```

---

### Task 2: Expose Super Admin controls and effective client state

**Files:**
- Modify: `app/api/v1/superadmin.py`
- Modify: `app/api/v1/dashboard.py`
- Test: `tests/api/test_datasource_feature_settings.py`

**Interfaces:**
- Consumes: `datasource_feature_enabled(db, space)` from Task 1.
- Produces: global GET/PATCH `/api/v1/super-admin/data-sources-feature` with `{platform_enabled: bool}`.
- Produces: space GET/PATCH `/api/v1/super-admin/spaces/{space_id}/data-sources-feature` with `{override: bool | null, effective_enabled: bool}`.
- Extends: dashboard nav response with `features: {data_sources: bool}`.

- [ ] **Step 1: Write failing API tests for global, inherited, and disabled resolution**

Cover these assertions using the project FastAPI test client and database fixtures:

```python
assert client.get("/api/v1/super-admin/data-sources-feature", headers=admin).json() == {
    "platform_enabled": True
}

response = client.patch(
    f"/api/v1/super-admin/spaces/{space.id}/data-sources-feature",
    headers=admin,
    json={"override": False},
)
assert response.json() == {"override": False, "effective_enabled": False}

nav = authenticated_client.get("/api/v1/dashboard/nav-config").json()
assert nav["features"]["data_sources"] is False
assert "data-sources" not in nav["enabled_nav_items"]
```

Also prove that `override: true` remains effectively false when the platform master is false.

- [ ] **Step 2: Run the endpoint tests and verify 404/schema failures**

Run: `.venv/bin/pytest tests/api/test_datasource_feature_settings.py -q`

Expected: FAIL because the distinct feature endpoints and `features` response do not exist.

- [ ] **Step 3: Implement strict request models and four Super Admin endpoints**

Add:

```python
class DataSourcesPlatformRequest(BaseModel):
    platform_enabled: bool

class DataSourcesSpaceRequest(BaseModel):
    override: bool | None = None
```

Use `_get_or_create_platform_settings`, `get_org_by_id`, and `datasource_feature_enabled`. Persist the nullable override directly on `Space.datasources_enabled`. Do not modify `nav_config` or `enabled_nav_items` in these endpoints.

- [ ] **Step 4: Extend dashboard nav resolution**

Resolve the capability once, remove `data-sources` from the ordered navigation list when false, and return:

```python
return {
    "enabled_nav_items": ordered,
    "features": {"data_sources": data_sources_enabled},
}
```

- [ ] **Step 5: Run focused API tests**

Run: `.venv/bin/pytest tests/api/test_datasource_feature_settings.py -q`

Expected: PASS for global, inherited, explicit disabled, global override, and nav filtering cases.

- [ ] **Step 6: Commit the settings API increment**

```bash
git add app/api/v1/superadmin.py app/api/v1/dashboard.py tests/api/test_datasource_feature_settings.py
git commit -m "feat(datasource): expose admin feature controls"
```

---

### Task 3: Enforce capability in management and runtime paths

**Files:**
- Modify: `app/api/v1/datasource_tools.py`
- Modify: `app/api/v1/datasources.py`
- Modify: `app/services/datasource/registry.py`
- Test: `tests/api/test_datasource_feature_gate.py`
- Test: `tests/services/datasource/test_registry_feature_gate.py`

**Interfaces:**
- Consumes: `require_datasource_feature` and `datasource_feature_enabled` from Task 1.
- Preserves: existing datasource rows and assignment rows when disabled.

- [ ] **Step 1: Write failing API gate tests**

Parameterize representative read and mutation endpoints from both routers:

```python
@pytest.mark.parametrize("method,path", [
    ("get", "/api/v1/data-sources/tools"),
    ("post", "/api/v1/data-sources/import"),
    ("get", "/api/v1/datasources/"),
])
def test_disabled_feature_rejects_datasource_api(authenticated_client, disabled_feature, method, path):
    response = getattr(authenticated_client, method)(path, json={} if method == "post" else None)
    assert response.status_code == 403
    assert response.json()["detail"] == "Data Sources has been disabled by an administrator."
```

- [ ] **Step 2: Write the failing runtime discovery test**

Build a valid active assignment fixture, disable the space override, call registry discovery, and assert it returns no definitions without deleting the assignment:

```python
definitions = await registry.list_tools(context, agent_id, "custom")
assert definitions == []
assert await db.get(AgentToolAssignment, assignment.id) is not None
```

- [ ] **Step 3: Run focused tests and confirm the feature is currently ignored**

Run:

```bash
.venv/bin/pytest tests/api/test_datasource_feature_gate.py -q
.venv/bin/pytest tests/services/datasource/test_registry_feature_gate.py -q
```

Expected: FAIL because disabled spaces can still access and discover tools.

- [ ] **Step 4: Add router-level dependencies and registry short-circuit**

Add `dependencies=[Depends(require_datasource_feature)]` to both datasource routers so every current and future route inherits the gate. In registry public discovery/dispatch entry points, call `datasource_feature_enabled`; return an empty list for discovery and stable `tool_unavailable` for direct dispatch when false.

- [ ] **Step 5: Run gate tests and existing datasource tests**

Run:

```bash
.venv/bin/pytest tests/api/test_datasource_feature_gate.py tests/services/datasource/test_registry_feature_gate.py -q
.venv/bin/pytest tests/services/datasource tests/api -q
```

Expected: all pass; disabling and re-enabling preserves rows and restores discovery.

- [ ] **Step 6: Commit enforcement**

```bash
git add app/api/v1/datasource_tools.py app/api/v1/datasources.py app/services/datasource/registry.py tests/api/test_datasource_feature_gate.py tests/services/datasource/test_registry_feature_gate.py
git commit -m "feat(datasource): enforce feature availability"
```

---

### Task 4: Add atomic agent-centric tool assignment API

**Files:**
- Modify: `app/schemas/datasource.py`
- Modify: `app/api/v1/datasource_tools.py`
- Test: `tests/api/test_datasource_agent_tools.py`

**Interfaces:**
- Produces: `AgentToolReplace` with `chatbot_id: UUID` and `tool_ids: list[UUID]`.
- Produces: GET and PUT `/api/v1/data-sources/agents/{agent_kind}/{agent_id}/tools`.
- GET items contain `id`, `name`, `display_name`, `method`, `path`, `connection_name`, and `assigned`.

- [ ] **Step 1: Write failing assignment tests**

Create two active tools and two agents. Assert:

```python
response = client.put(
    f"/api/v1/data-sources/agents/custom/{agent_a.id}/tools",
    json={"chatbot_id": str(chatbot.id), "tool_ids": [str(tool_1.id), str(tool_2.id)]},
)
assert response.status_code == 200
assert {item["tool_id"] for item in response.json()["assignments"]} == {str(tool_1.id), str(tool_2.id)}
assert await assignment_exists(agent_b.id, tool_1.id)  # preserved
```

Add rejection cases for duplicate IDs, inactive tool/connection, triage, invalid kind, cross-space agent, and cross-chatbot agent. Assert a rejected replacement leaves prior assignments unchanged.

- [ ] **Step 2: Run tests and confirm endpoint failures**

Run: `.venv/bin/pytest tests/api/test_datasource_agent_tools.py -q`

Expected: FAIL with 404 for the new routes.

- [ ] **Step 3: Add schema and route contracts**

```python
class AgentToolReplace(ApiModel):
    chatbot_id: UUID
    tool_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_tools(self):
        if len(self.tool_ids) != len(set(self.tool_ids)):
            raise ValueError("Duplicate tool assignment")
        return self
```

Constrain `agent_kind` to `Literal["builtin", "custom"]` in the route. Reuse `_validate_assignment` for the agent, query all selected tools in one statement, require active tools and connections, then delete only rows matching `space_id`, `chatbot_id`, `agent_kind`, and `agent_id`. Insert replacements and commit once.

- [ ] **Step 4: Return picker-ready GET data**

Join active tools to their connections, load current assignment IDs for the selected agent, and return every active available tool with `assigned` set from membership. Never return credentials or header values.

- [ ] **Step 5: Run assignment and datasource API tests**

Run:

```bash
.venv/bin/pytest tests/api/test_datasource_agent_tools.py -q
.venv/bin/pytest tests/api/test_datasource_feature_gate.py -q
```

Expected: all pass, including atomic rollback and preservation of other agents.

- [ ] **Step 6: Commit the assignment API**

```bash
git add app/schemas/datasource.py app/api/v1/datasource_tools.py tests/api/test_datasource_agent_tools.py
git commit -m "feat(datasource): add agent-centric tool assignment"
```

---

### Task 5: Store capability state and guard datasource routes

**Files:**
- Modify: `ui/src/store/useAppStore.ts`
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/components/layout/Sidebar.tsx`
- Modify: `ui/src/App.tsx`
- Create: `ui/src/features/data-sources/DataSourceFeatureGuard.tsx`
- Test: `ui/src/features/data-sources/DataSourceFeatureGuard.test.tsx`

**Interfaces:**
- Produces store field `dataSourcesEnabled: boolean | null` and setter `setDataSourcesEnabled(value: boolean): void`.
- Extends `getNavConfig()` response type with `features.data_sources`.
- Guard renders children only when capability is true.

- [ ] **Step 1: Write failing guard tests**

Using Vitest and React Testing Library, verify loading, enabled, and disabled states:

```tsx
it('blocks a direct datasource route when disabled', () => {
  useAppStore.setState({ dataSourcesEnabled: false })
  render(<MemoryRouter><DataSourceFeatureGuard><div>source page</div></DataSourceFeatureGuard></MemoryRouter>)
  expect(screen.queryByText('source page')).not.toBeInTheDocument()
  expect(screen.getByText(/disabled by an administrator/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test and confirm missing component/state failures**

Run: `npm test -- DataSourceFeatureGuard.test.tsx`

Expected: FAIL because the guard and state field do not exist.

- [ ] **Step 3: Add state, API typing, and bootstrap wiring**

On successful `getNavConfig`, set both fields:

```tsx
setEnabledNavItems(data.enabled_nav_items)
setDataSourcesEnabled(data.features.data_sources)
```

On failure set `dataSourcesEnabled` to false while preserving the existing navigation fallback for unrelated items. Reset the feature state to `null` on logout.

- [ ] **Step 4: Add the feature guard and wrap both datasource routes**

The guard reads the store. `null` renders a compact loading state; `false` renders “Data Sources has been disabled by an administrator” and a link to `/app/agents`; `true` renders children. Wrap `/app/data-sources` and `/app/agents/datasource` inside the existing authentication/layout structure.

- [ ] **Step 5: Run guard tests and production build**

Run:

```bash
npm test -- DataSourceFeatureGuard.test.tsx
npm run build
```

Expected: guard tests and TypeScript/Vite production build pass.

- [ ] **Step 6: Commit client capability state**

```bash
git add ui/src/store/useAppStore.ts ui/src/api/client.ts ui/src/components/layout/Sidebar.tsx ui/src/App.tsx ui/src/features/data-sources/DataSourceFeatureGuard.tsx ui/src/features/data-sources/DataSourceFeatureGuard.test.tsx
git commit -m "feat(datasource): guard client feature access"
```

---

### Task 6: Add distinct Super Admin feature controls

**Files:**
- Modify: `ui/src/screens/SuperAdmin.tsx`
- Test: `ui/src/screens/SuperAdmin.datasource-feature.test.tsx`

**Interfaces:**
- Consumes: Task 2 Super Admin endpoints.
- Produces: `DataSourcesPlatformControl` and a three-state per-space control.

- [ ] **Step 1: Write failing UI tests**

Mock the Super Admin fetch helper and assert:

```tsx
expect(screen.getByRole('button', { name: /disable data sources/i })).toBeEnabled()
await user.click(screen.getByRole('button', { name: /disable data sources/i }))
expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/data-sources-feature'), expect.objectContaining({ method: 'PATCH' }))
```

For the space modal, select Inherit, Enabled, and Disabled and assert PATCH bodies `{override:null}`, `{override:true}`, and `{override:false}`. With platform off, assert “Disabled by platform” is visible.

- [ ] **Step 2: Run the UI test and verify missing-control failure**

Run: `npm test -- SuperAdmin.datasource-feature.test.tsx`

Expected: FAIL because the distinct control is absent.

- [ ] **Step 3: Implement global feature control**

Follow `HomepageSectionsPlatformControl` interaction patterns but use the datasource endpoint and explicit copy:

```tsx
<p className="text-sm font-semibold">Data Sources</p>
<p className="text-xs text-gray-500">Controls datasource APIs, agent tools, routes, and menu availability.</p>
```

Keep this control separate from `NavConfigTab`.

- [ ] **Step 4: Implement per-space inheritance control**

Load it with the existing space-modal requests. Render a three-option Select. Show effective status independently of the stored override and disable only misleading “effective on” styling when the platform master is off.

- [ ] **Step 5: Run UI tests and build**

Run:

```bash
npm test -- SuperAdmin.datasource-feature.test.tsx
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit Super Admin UI**

```bash
git add ui/src/screens/SuperAdmin.tsx ui/src/screens/SuperAdmin.datasource-feature.test.tsx
git commit -m "feat(datasource): add super admin feature controls"
```

---

### Task 7: Build reusable Agent tool picker

**Files:**
- Modify: `ui/src/api/client.ts`
- Create: `ui/src/features/data-sources/DataSourceToolPicker.tsx`
- Test: `ui/src/features/data-sources/DataSourceToolPicker.test.tsx`

**Interfaces:**
- Adds: `listAgentDataSourceTools(agentKind, agentId, chatbotId)`.
- Adds: `replaceAgentDataSourceTools(agentKind, agentId, payload)`.
- Picker props: `agent: {id: string; name: string; is_builtin: boolean}`, `chatbotId: string`, `onClose`, `onSaved`, and `onCreateSource`.

- [ ] **Step 1: Write failing picker behavior tests**

Mock two tools, one assigned. Assert initial checks, search filtering, multi-select, save payload, and empty state:

```tsx
await user.click(screen.getByLabelText('Orders API'))
await user.click(screen.getByRole('button', { name: /save assignments/i }))
expect(apiClient.replaceAgentDataSourceTools).toHaveBeenCalledWith(
  'custom', agent.id,
  { chatbot_id: chatbotId, tool_ids: expect.arrayContaining([ordersTool.id]) },
)
```

Also assert “Create new data source” invokes `onCreateSource` and no delete/disable API is called when unchecking a tool.

- [ ] **Step 2: Run tests and confirm missing picker/API failures**

Run: `npm test -- DataSourceToolPicker.test.tsx`

Expected: FAIL because the component and methods do not exist.

- [ ] **Step 3: Implement typed API methods and picker states**

Add GET/PUT methods matching Task 4. The modal loads on open, keeps selected IDs locally, filters by display name, connection, method, and path, and sends one atomic replacement. Render loading, error with Retry, no active tools, no search results, and saving states.

- [ ] **Step 4: Add create-source handoff**

The secondary action calls `onCreateSource`; the parent owns opening `DataSourceWizard`. After wizard completion, reopen/refresh the picker so the new active tool appears. Do not nest two dialogs simultaneously.

- [ ] **Step 5: Run picker tests and build**

Run:

```bash
npm test -- DataSourceToolPicker.test.tsx
npm run build
```

Expected: all picker states and build pass.

- [ ] **Step 6: Commit reusable picker**

```bash
git add ui/src/api/client.ts ui/src/features/data-sources/DataSourceToolPicker.tsx ui/src/features/data-sources/DataSourceToolPicker.test.tsx
git commit -m "feat(datasource): add reusable agent tool picker"
```

---

### Task 8: Replace legacy Agent-page datasource controls

**Files:**
- Modify: `ui/src/screens/Agents.tsx`
- Test: `ui/src/screens/Agents.datasource-tools.test.tsx`

**Interfaces:**
- Consumes: `dataSourcesEnabled` from Task 5 and `DataSourceToolPicker` from Task 7.
- Removes: Agent-page calls to legacy `listDataSources()` and `deleteDataSource()`.

- [ ] **Step 1: Write failing Agent-page integration tests**

Assert no datasource API requests or controls when disabled:

```tsx
useAppStore.setState({ dataSourcesEnabled: false })
render(<Agents />)
expect(apiClient.listAgentDataSourceTools).not.toHaveBeenCalled()
expect(screen.queryByText('Plug data source')).not.toBeInTheDocument()
```

When enabled, expand a non-triage agent, assert assigned tools render, open the picker, and assert triage never shows the section.

- [ ] **Step 2: Run tests and confirm legacy behavior fails expectations**

Run: `npm test -- Agents.datasource-tools.test.tsx`

Expected: FAIL because Agents still loads legacy data sources and navigates to the old create-only route.

- [ ] **Step 3: Remove legacy state and datasource deletion**

Delete the legacy `DataSource` interface, `dataSources` state, mount-time `listDataSources` request, `handleDeleteDs`, and `agent_type` filtering. Unplugging must never call a datasource delete endpoint.

- [ ] **Step 4: Integrate effective capability and picker**

Read `dataSourcesEnabled` from the store. For each non-triage agent, render the collapsible section only when true. On expansion, use the agent-centric GET response to show assigned tools and status. “Plug data source” opens the picker for `{agent_kind: agent.is_builtin ? 'builtin' : 'custom', agent_id: agent.id}` and the current chatbot.

- [ ] **Step 5: Wire new-source handoff**

When the picker requests creation, close it, open the existing `DataSourceWizard`, and pass the current agent as the optional assignment target context. On completion, reload the agent's tool list and return to the picker. Preserve the wizard’s existing “Skip for now” behavior.

- [ ] **Step 6: Run Agent UI tests and full frontend verification**

Run:

```bash
npm test -- Agents.datasource-tools.test.tsx DataSourceToolPicker.test.tsx DataSourceFeatureGuard.test.tsx
npm run build
```

Expected: all tests pass and the production build succeeds.

- [ ] **Step 7: Commit Agent-page integration**

```bash
git add ui/src/screens/Agents.tsx ui/src/screens/Agents.datasource-tools.test.tsx
git commit -m "feat(datasource): plug tools into agents"
```

---

### Task 9: Cross-layer verification and documentation

**Files:**
- Modify: `docs/deployment/datasource-egress.md`
- Modify: `docs/superpowers/plans/2026-09-02-datasource-feature-control.md` (checkbox status only during execution)

**Interfaces:**
- Verifies every interface produced by Tasks 1–8.

- [ ] **Step 1: Run the backend feature and datasource suites**

```bash
.venv/bin/pytest tests/services/datasource tests/api/test_datasource_feature_settings.py tests/api/test_datasource_feature_gate.py tests/api/test_datasource_agent_tools.py -q
```

Expected: all pass.

- [ ] **Step 2: Run frontend tests and production build**

```bash
cd ui
npm test -- DataSourceFeatureGuard.test.tsx SuperAdmin.datasource-feature.test.tsx DataSourceToolPicker.test.tsx Agents.datasource-tools.test.tsx
npm run build
```

Expected: all tests and build pass with no TypeScript errors.

- [ ] **Step 3: Verify migration reversibility on a disposable database**

Run upgrade to `0050_datasource_feature_control`, downgrade to `fb1871f37217`, and upgrade to head. Confirm both columns exist after the final upgrade and existing space rows retain `NULL` overrides.

- [ ] **Step 4: Document operational behavior**

Add a “Feature control” section explaining the platform master, per-space inheritance, navigation independence, HTTP 403 behavior, runtime removal, and that disabling preserves data and assignments.

- [ ] **Step 5: Inspect the final diff for secret exposure and unrelated changes**

Run:

```bash
git diff --check
git status --short
rg -n "encrypted_secret|auth_value|credential" app/api/v1/datasource_tools.py ui/src/features/data-sources
```

Expected: no whitespace failures, only scoped files staged, and no new response/UI exposes stored secret values.

- [ ] **Step 6: Commit documentation and verification record**

```bash
git add docs/deployment/datasource-egress.md docs/superpowers/plans/2026-09-02-datasource-feature-control.md
git commit -m "docs(datasource): document feature controls"
```
