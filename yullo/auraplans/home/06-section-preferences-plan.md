# Yullo Home Section Preferences Implementation Plan

**Goal:** Let each authenticated Yullo user show, hide, and order Home sections while keeping safe defaults and automatic layout reflow.

**Architecture:** Store a compact validated JSON configuration on `yullo_user_preferences`. The backend normalizes it against a server-owned section registry; the frontend uses the same IDs and merges newly introduced defaults safely.

**Depends on:** `05-api-frontend-integration-plan.md`

## Reuse boundary

Reuse shared `users.id` only as the owner identity. Keep Home section preferences in `yullo_user_preferences` because the section registry and layout are Yullo-specific. Do not add Home fields to a shared Support247 settings table or `spaces`; do not store them in `yullo_configs`, which is Space-scoped rather than user-scoped.

## Exact preference command

Create `app/yullo/services/home/preferences.py:update_home_preferences(user_id,patch)`: command transaction INSERT ON CONFLICT DO NOTHING preference row, SELECT FOR UPDATE, validate unique known section IDs, strict booleans and integer order0..1000, merge supplied section entries with existing values, preserve unrelated theme/timezone, assign new JSON object, commit. Server settings cap count9. PATCH uses current_user/CSRF and returns effective registry. Empty patch is no-op; explicit resetToDefaults=true resets sections. This prevents concurrent section/theme writes overwriting each other.

Frontend `useUpdateHomePreferences` cancels matching owner query, snapshots cache, optimistically applies submitted settings, rolls back on failure, invalidates on success. Unknown action or missing destination removes button, not entire valid metric. Production never falls back to fixtures.


## Route, schema and persistence mapping

Modify `app/models/yullo_user_preference.py` with home_sections JSONB NOT NULL DEFAULT []. Add `HomeSectionPatch{id:HomeSectionId,enabled:StrictBool,order:StrictInt}` and `HomePreferencePatch{sections:list[HomeSectionPatch]|None,resetToDefaults:bool=false}` in app/schemas/yullo_home.py. Reject both reset and sections together. Unknown fields rejected.

`app/yullo/api/home.py:patch_home_preferences(patch,user=Depends(current_user))` calls update_home_preferences with user.id only. Existing CSRF dependency required. Map patch.sections to home_sections, update updated_at to server UTC; no writes to any Space table. GET normalization uses server defaults for missing IDs. Valid IDs: pulse,rightNow,attention,forYou,spaces,quickInsight,orbit,recent,pattern.

Default order: 10,20,30,40,50,60,70,80,90 respectively; all enabled. Resolve equal supplied orders by this canonical order, then normalize multiples of10. Existing omitted overrides survive a partial update. Example: PATCH sections=[{id:orbit,enabled:false,order:70}] changes only Orbit; preserves theme/timezone/other sections. Reset empties stored overrides and returns defaults.

Create `ui/src/yullo/api/queries.ts:useUpdateHomePreferences(userId)` using the existing CSRF-aware client. Settings surface triggers mutation; response replaces only preference in the same owner cache. Serialize mutations per user; controls disabled while pending to avoid overlapping optimistic rollback. Renderer combines visibility with supported-data availability and reflows bands. No public Aura controls are added.
