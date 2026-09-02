# Data Source Feature Control and Agent Assignment

## Goal

Make Data Sources a distinct platform capability controlled by Super Admin at two levels, and let space users plug existing datasource tools into agents from the Agent page.

The capability switch is separate from navigation configuration. Navigation controls where a feature appears; the capability switch controls whether the feature exists for a space at all.

## Effective availability

Two stored settings determine availability:

- `PlatformSettings.datasources_platform_enabled`: the global master switch.
- `Space.datasources_enabled`: a nullable per-space override. `NULL` inherits the platform setting, `false` disables the feature for that space, and `true` allows it only while the platform switch is on.

The effective value is:

```text
datasources_platform_enabled
AND
(space.datasources_enabled IS NULL OR space.datasources_enabled = true)
```

A space override can restrict the platform setting but cannot bypass a disabled global switch. The migration defaults the platform switch to `true` and space overrides to `NULL`, preserving current installations.

The Data Sources sidebar entry additionally requires the existing `data-sources` navigation item to be enabled. Therefore:

```text
show menu = effective capability AND effective navigation item
```

Agent-page datasource controls depend only on the effective capability. Hiding the standalone menu does not remove an enabled agent integration.

## Backend design

### Storage and migration

Add the two columns above in a new Alembic migration. Add model serialization for the space override where Super Admin needs it.

Create `app/services/datasource/availability.py` as the single policy implementation. It will expose:

- A query helper that resolves effective availability for a space.
- A FastAPI dependency that rejects unavailable datasource operations with HTTP 403 and a stable message.

### Super Admin API

Add distinct endpoints rather than overloading navigation endpoints:

- `GET /api/v1/super-admin/data-sources-feature`
- `PATCH /api/v1/super-admin/data-sources-feature`
- `GET /api/v1/super-admin/spaces/{space_id}/data-sources-feature`
- `PATCH /api/v1/super-admin/spaces/{space_id}/data-sources-feature`

The global response contains `platform_enabled`. The space response contains `override` (`null`, `true`, or `false`) and `effective_enabled`. Requests use the same values. The API never reports a space as effectively enabled while the global switch is off.

### Space-facing capability response

Extend `GET /api/v1/dashboard/nav-config` with:

```json
{
  "enabled_nav_items": [],
  "features": { "data_sources": true }
}
```

When the feature is unavailable, the server removes `data-sources` from `enabled_nav_items`, even if navigation configuration contains it. This gives the frontend one authoritative bootstrap response.

### Enforcement

Apply the availability dependency to both datasource API families:

- `/api/v1/data-sources/*` (current tool registry)
- `/api/v1/datasources/*` (legacy endpoints while they remain mounted)

Runtime registry loading must also return no datasource tools when the feature is unavailable. This prevents already-assigned tools from remaining callable after Super Admin disables the feature. Disabling the feature does not delete connections, tools, tests, or assignments; re-enabling restores them.

### Agent-centric assignment API

The current assignment endpoint replaces agents for one tool. The Agent page needs the inverse operation without making one request per tool or accidentally removing other agents. Add:

- `GET /api/v1/data-sources/agents/{agent_kind}/{agent_id}/tools?chatbot_id=...`
- `PUT /api/v1/data-sources/agents/{agent_kind}/{agent_id}/tools`

The PUT body contains `chatbot_id` and a unique list of `tool_ids`. In one transaction it:

1. Validates that the agent belongs to the current space/chatbot and is not triage.
2. Validates that every selected tool belongs to the space and is active.
3. Deletes assignments only for that agent and chatbot.
4. Creates the requested assignments while preserving assignments belonging to other agents.
5. Invalidates datasource runners for the affected chatbot.

The GET response returns active available tools plus an `assigned` boolean, allowing one request to populate the selector.

## Frontend design

### Shared feature state and route guard

Store `features.data_sources` beside `enabledNavItems` in `useAppStore`. Sidebar loading updates both values. Logout clears both.

Add a small datasource capability guard around `/app/data-sources` and the compatibility `/app/agents/datasource` route. If disabled, render a friendly unavailable state with a link back to Agents. This protects direct navigation while the backend remains the authority.

### Super Admin controls

Add a dedicated “Data Sources feature” control in the global settings area. It explains that disabling it hides the feature and prevents agents from calling assigned datasource tools.

Add a three-state control in each space settings modal:

- Inherit platform setting
- Enabled
- Disabled

When the platform master switch is off, the space control remains visible but clearly reports “Disabled by platform.” Existing navigation controls remain unchanged and independently control the sidebar entry.

### Agent page

Remove the Agent page’s legacy `SpaceDataSource` loading and deletion behavior. When `features.data_sources` is false, render no datasource section and make no datasource requests.

When enabled, each non-triage agent card has a “Data Sources” section that lists current tool-registry assignments. “Plug data source” opens a reusable `DataSourceToolPicker` modal containing:

- Searchable active datasource tools.
- Connection name and HTTP method/path for identification.
- Multi-select checkboxes.
- “Save assignments” and Cancel actions.
- A secondary “Create new data source” action that opens the existing datasource wizard and returns to the picker after creation.

Removing a selection unplugs the tool from that agent only; it never disables or deletes the datasource. Empty, loading, disabled, and error states use explicit copy.

## Error and state behavior

- A feature-state API failure defaults to disabled for Agent-page controls and direct routes; the sidebar retains its current navigation fallback behavior for unrelated items.
- HTTP 403 from a stale open screen shows “Data Sources has been disabled by an administrator” and stops further mutation.
- Assignment save is atomic. A validation failure leaves existing assignments unchanged.
- If a tool is disabled between picker load and save, the API rejects the selection and the picker refreshes.
- Switching the global feature off takes effect on the next request and runner reload; no data is destroyed.

## Files and boundaries

Expected backend changes:

- `app/models/space.py`
- new Alembic migration
- `app/services/datasource/availability.py`
- `app/api/v1/superadmin.py`
- `app/api/v1/dashboard.py`
- `app/api/v1/datasource_tools.py`
- `app/api/v1/datasources.py`
- `app/services/datasource/registry.py`
- datasource request schemas for agent-centric assignment

Expected frontend changes:

- `ui/src/store/useAppStore.ts`
- `ui/src/api/client.ts`
- `ui/src/components/layout/Sidebar.tsx`
- `ui/src/App.tsx`
- `ui/src/screens/SuperAdmin.tsx`
- `ui/src/screens/Agents.tsx`
- new reusable datasource feature guard and tool-picker components under `ui/src/features/data-sources/`

## Verification

- Migration upgrade succeeds with existing spaces inheriting an enabled platform default.
- Global off overrides every space and blocks APIs/runtime tools.
- Global on plus inherited/on/off space states resolve correctly.
- Navigation off hides only the standalone menu while Agent-page plugging remains available.
- Disabled capability hides both menu and Agent controls and blocks direct routes.
- Agent-centric replacement preserves other agents’ assignments.
- Triage, cross-space agents, cross-chatbot agents, duplicate tools, and inactive tools are rejected.
- Frontend typecheck and production build pass.
