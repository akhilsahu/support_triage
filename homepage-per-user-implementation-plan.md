# Implementation Plans: Chatbot Context-Aware Rendering

Two related but independent plans:
- **Part A** — AI-recommended homepage sections (pre-chat empty state), per chatbot + visitor.
- **Part B** — AI-recommended response components (during conversation), per agent response.

They share the same safety model (fixed component pool, LLM classifies/fills data — never generates code) but touch different files and ship independently; Part B does not depend on Part A being built first.

---

## Directory map

Every path below is either an existing file being extended (marked *existing*) or a new file/directory this work creates (marked *new*). Nothing outside these locations should need to change.

**Design principle (per review):** all AI-recommendation logic — for both parts — lives as pluggable, swappable utility modules in one dedicated location per stack: `app/renderengine/` (backend) and `ui/src/renderengine/` (frontend). Existing API files and screens only *call into* these modules; they don't contain the recommendation/selection logic themselves. This keeps the blast radius on existing files minimal (a function call, not embedded logic) and means adding a third rendering surface later is a new file inside `renderengine/`, not changes scattered across the app. No new API router is introduced — the hot path (visitor homepage load, chat response) still calls `app/renderengine/` in-process from inside the existing `space.py`/`chat.py` handlers, preserving the no-extra-round-trip decision already locked in; admin-config writes reuse the existing `app/api/v1/chatbots.py` endpoint the same way.

### Part A — Homepage sections

| Layer | Path | Status |
|---|---|---|
| Backend — data model | `app/models/chatbot.py` | existing, add 1 column |
| Backend — migration | `alembic/versions/0024_<name>.py` (next after `0023_message_feedback.py`) | new |
| Backend — engine (pool contract + recommendation logic) | `app/renderengine/homepage_sections.py` | new (modeled on existing `app/utils/ai/chat_suggestions.py`) |
| Backend — shared engine scaffolding | `app/renderengine/base.py` (cache-check → override-check → LLM-call-with-timeout → validate → fallback, shared with Part B) | new |
| Backend — public API (visitor-facing) | `app/api/space.py` (`GET /api/v1/space/public/{slug}` handler) | existing, calls `app/renderengine/homepage_sections.py`, minimal diff |
| Backend — admin override API | `app/api/v1/chatbots.py` (`PATCH /api/v1/chatbots/{slug}`) | existing, calls `app/renderengine/homepage_sections.py` for validation, minimal diff |
| Frontend — engine (section components + registry) | `ui/src/renderengine/homepage/` | new directory |
| Frontend — API client methods | `ui/src/api/client.ts` | existing, extend |
| Frontend — integration point | `ui/src/screens/CustomerChat.tsx` (the `isEmpty` block, ~line 590) | existing, calls `ui/src/renderengine/homepage`, minimal diff |
| Frontend — admin override UI | `ui/src/screens/ChatbotProfile.tsx` | existing, modify |

### Part B — Response-driven components

| Layer | Path | Status |
|---|---|---|
| Backend — data model (kill switch) | `app/models/chatbot.py` | existing, add 1 column (`response_components_enabled`) |
| Backend — migration | same batch as Part A's `alembic/versions/0024_<name>.py` | new |
| Backend — engine (pool contract + recommendation logic) | `app/renderengine/response_components.py` | new (extends `app/renderengine/base.py`) |
| Backend — agent structured output | `app/orchestra/ai/orchestrators/agno.py` | existing, calls `app/renderengine/response_components.py`, minimal diff |
| Backend — response schema | `app/api/chat.py` (`ChatResponse`) | existing, extend (one new field) |
| Backend — admin toggle API | `app/api/v1/chatbots.py` (`PATCH /api/v1/chatbots/{slug}`) | existing, extend payload, no new route |
| Frontend — engine (component library + registry) | `ui/src/renderengine/response/` | new directory |
| Frontend — integration point | `ui/src/screens/CustomerChat.tsx` (`Message` interface + message-thread render, ~line 636) | existing, calls `ui/src/renderengine/response`, minimal diff |
| Frontend — admin toggle UI | `ui/src/screens/ChatbotProfile.tsx` | existing, modify (shared card with Part A's override UI) |

Both parts modify `CustomerChat.tsx`, but in disjoint regions (empty-state block vs. message-thread block) — they can be built and reviewed as separate PRs without conflicting. Neither part adds logic to `CustomerChat.tsx` beyond "fetch data, hand it to the renderengine, render what comes back."

---

## Integration flow — how this reaches an already-live bot

Neither part requires bot-specific setup work. Both engines read data that already exists for any live tenant (name, description, already-configured agents) — the only lever that actually "integrates" a specific existing bot is the rollout allowlist described at the end of this section.

### Part A — visitor lands on `/:slug` of an existing bot

1. `CustomerChat.tsx` mounts, calls the existing `GET /api/v1/space/public/{slug}` endpoint (now also carrying `device`/`visitor_type`) — same call it makes today, no new request added.
2. `space.py` resolves `Space`/`Chatbot` exactly as it does today — unchanged DB lookup.
3. Handler makes one new call: `app/renderengine/homepage_sections.get_homepage_sections(...)`.
4. First hit for this bot: `Chatbot.homepage_sections_override` is `NULL` (no admin has touched it yet) → falls through. Redis cache for this segment is empty → falls through. LLM is called using data that already exists for this bot (`display_name`, `description`, whichever agents are already enabled) — timeout-guarded, validated against `ALLOWED_SECTIONS`, then cached.
5. Response includes `homepage_sections`; `SectionRenderer` composes the page.
6. Every subsequent visitor in the same segment (same chatbot + device + new/returning) for the next few hours hits the Redis cache — instant, no LLM call.

### Part B — visitor sends a message to an existing bot mid-chat

1. Message flow is unchanged up to generation: `POST /api/chat/{slug}` → `app/api/chat.py` → `AgnoOrchestrator.run()` against that space's already-built Team.
2. The agent's structured-output schema is a platform-level definition (inside the shared Agno agent factory), not per-bot config — so the moment this ships, every existing bot's agents are automatically asked to optionally emit `component: {type, fields}` alongside `reply`. No per-tenant migration.
3. `app/renderengine/response_components.py` validates whatever the agent returned, **and checks the bot's `response_components_enabled` flag first** (see Part B §2 below) — if disabled for this bot, the component is dropped before it ever reaches the response, regardless of what the agent emitted.
4. `ChatResponse` carries the (possibly-null) `component` back; frontend renders via `ui/src/renderengine/response`.

### The actual integration lever: rollout allowlist

This isn't switched on for every live bot simultaneously. Per Part A §9: it ships computing-but-unused first, then an allowlist (env var or DB flag per space) exposes it to a handful of test tenants, then rolls out platform-wide. Concretely, integrating one specific existing bot means adding its `space_id` to that allowlist — everything else (data, agents, branding) is already in place and needs no bot-specific work. Once a space is in the allowlist, each individual chatbot within it still defaults to AI-driven behavior for both parts, with the override/toggle fields (`homepage_sections_override`, `response_components_enabled`) available as an escape hatch per bot at any time, without needing to remove the space from the allowlist.

---

# Part A: AI-Recommended Homepage Sections (Per Chatbot / Per Visitor)

## 1. What we're building

Today, `CustomerChat.tsx`'s empty/welcome state (before the visitor sends a first message) is a single hardcoded block: logo, "Hi there 👋", `space.description`, and suggestion chips.

This plan replaces that fixed block with a **composed set of pre-built section components**, chosen and ordered by an LLM based on the chatbot's own data (name, description, enabled agent types) and cheap visitor signals (device type, new vs. returning). The LLM classifies into a fixed, developer-maintained pool — it never generates free-form copy. Recommendations are cached in Redis per segment (`chatbot_id + device + visitor_type`) so most visitors get an instant cached result. Space admins can override the section list (and specific section content, e.g. a promo banner) per chatbot from the existing `ChatbotProfile` screen.

This mirrors the existing pattern in `app/utils/ai/chat_suggestions.py` (Redis-cached, `llm_service.generate_with_fallback`, hardcoded fallback, try/except around every external call).

No new routes. No changes to chat mechanics, SSE streaming, or session handling in `CustomerChat.tsx`.

---

## 2. Data model changes

**File:** `app/models/chatbot.py`

Add one column to `Chatbot`:

```python
# Admin override for the homepage empty-state sections.
# NULL = defer to AI recommendation. JSON: {"sections": ["hero", "faq", ...], "overrides": {"promo": {"text": "..."}}}
homepage_sections_override = Column(Text, nullable=True)
```

**Migration:** new Alembic revision adding this single nullable column — additive, no backfill needed, zero risk to existing rows.

**Verify:** `alembic upgrade head` runs clean; `Chatbot.to_dict()` includes the new field (parsed JSON or `None`).

---

## 3. Fixed section pool (shared contract)

Define the canonical list once, referenced by both backend (for the LLM prompt's allowed values) and frontend (component registry). Suggest a small v1 set:

| id | purpose |
|---|---|
| `hero` | logo/name/greeting — today's default block, always safe fallback |
| `capabilities` | "what this bot can help with," derived from active agent types |
| `suggested_questions` | today's suggestion chips (reuses existing `/api/chat/{slug}/suggestions`) |
| `faq` | short Q&A pulled from KB doc types, if available |
| `promo` | admin-authored promotional content (empty/hidden unless admin sets it via override) |

Keep this list in one place: `app/renderengine/homepage_sections.py` (`ALLOWED_SECTIONS = [...]`), mirrored in `ui/src/renderengine/homepage/registry.ts`.

---

## 4. Backend: recommendation engine

**New file:** `app/renderengine/homepage_sections.py`, modeled directly on `chat_suggestions.py`, built on the shared `app/renderengine/base.py` scaffolding (also used by Part B's `response_components.py`).

```python
_CACHE_TTL = 60 * 60 * 4  # 4h — segment cache, not per-request
_CACHE_KEY = "homepage:sections:{chatbot_id}:{device}:{visitor_type}"
_DEFAULT_SECTIONS = ["hero", "suggested_questions"]  # today's current behavior

async def get_homepage_sections(chatbot_id, org_name, description, active_agents, device, visitor_type) -> list[str]:
    # 1. Check admin override first (DB read) — if set, return it, skip LLM+cache entirely.
    # 2. Check Redis cache_key — return cached list if present.
    # 3. Call LLM with asyncio.wait_for(..., timeout=0.4) wrapping the generation.
    #    - On success: validate the returned list only contains ALLOWED_SECTIONS values,
    #      dedupe, cap length (e.g. max 4 sections so the page isn't a wall of blocks).
    #    - On timeout/error/invalid output: return _DEFAULT_SECTIONS, do NOT cache the failure
    #      (so the next visitor in the segment retries the LLM rather than being stuck).
    # 4. Cache successful results only.
```

Key decisions locked from the design discussion:
- **Admin override always wins**, checked before touching cache or LLM.
- **Timeout budget ~300–500ms**, wrapped with `asyncio.wait_for`; failure path never raises, always returns `_DEFAULT_SECTIONS`.
- **Cache successes only** — a transient LLM failure shouldn't poison the segment cache for 4 hours.
- Validate LLM output against `ALLOWED_SECTIONS` — never trust the model to only return known values.

**Verify:** unit tests with a mocked `llm_service` — (a) happy path returns validated list, (b) malformed JSON falls back to default, (c) timeout falls back to default without raising, (d) admin override short-circuits both cache and LLM, (e) second call within TTL hits cache (mock LLM call count == 1).

---

## 5. Backend: API contract

**File:** `app/api/space.py`, extend the existing `GET /api/v1/space/public/{slug}` handler (`org_public_info`) rather than adding a second network round trip — `CustomerChat.tsx` already calls this on mount. The handler's own diff is small: it resolves `chatbot`/`org` as it does today, then makes **one call** into the engine —

```python
from app.renderengine.homepage_sections import get_homepage_sections
sections = await get_homepage_sections(chatbot_id=..., org_name=..., description=..., active_agents=..., device=..., visitor_type=...)
```

— and includes the result in its existing response dict. All cache/LLM/timeout/fallback/override logic stays inside `app/renderengine/`, not in `space.py`.

Add:
- Query params (or derive server-side from headers): `device` (`mobile`/`desktop`, can be derived from `User-Agent` if not passed), `visitor_type` (`new`/`returning`, derived from a request cookie the frontend already sets for session continuity).
- Response gains: `"homepage_sections": ["hero", "capabilities", "suggested_questions"]` and, when present, `"section_overrides": {"promo": {"text": "..."}}`.

**Admin override**, in `app/api/v1/chatbots.py` — confirmed this is where `PATCH /api/v1/chatbots/{slug}` (display_name/description/theme_color/active/etc.) already lives, called from `ChatbotProfile.tsx` via `apiClient.updateChatbot()` in `ui/src/api/client.ts`. Add `homepage_sections_override` as one more field on the existing `PATCH /api/v1/chatbots/{slug}` payload (reuses the existing endpoint/auth/pattern exactly — no new router). The handler passes the raw payload to a validation function in `app/renderengine/homepage_sections.py` (checks values against `ALLOWED_SECTIONS`) before persisting; again, the validation logic lives in the engine, not in `chatbots.py`. Clearing: `sections: null` in the same payload to revert to AI recommendation.

**Verify:** hit `/api/v1/space/public/{slug}` with curl for a known slug, confirm `homepage_sections` present and validated; confirm a slug with an override set returns that override verbatim with no LLM call (check logs/timing).

---

## 6. Frontend: rendering engine (section component library)

**New directory:** `ui/src/renderengine/homepage/`

- `HeroSection.tsx` — today's existing hero block, extracted as-is (logo, greeting, description) so it's the guaranteed-safe fallback.
- `CapabilitiesSection.tsx` — small cards/list built from `active_agents` data already available from `space`/chatbot info.
- `SuggestedQuestionsSection.tsx` — today's chip row, extracted as-is (reuses existing `suggestions` state/fetch, unchanged).
- `FaqSection.tsx` — short Q&A list (data source TBD — likely a lightweight KB query; can ship as a stub returning nothing if no data, rather than blocking this plan).
- `PromoSection.tsx` — renders only `section_overrides.promo`; renders nothing if absent (never AI-generated).
- `registry.ts` — `id → Component` map, mirroring the backend's `ALLOWED_SECTIONS`, plus a `SectionRenderer` component that maps `homepage_sections: string[]` to rendered components in order, skipping unknown ids defensively. `index.ts` re-exports `SectionRenderer` as the only thing other files need to import.

Adding a new section type later means: one new component file here + one new line in `registry.ts` + one new entry in the backend's `ALLOWED_SECTIONS`. `CustomerChat.tsx` never needs to change for that.

**Verify:** Storybook-less manual check — render each section component in isolation with sample props; confirm `SectionRenderer` silently skips an unrecognized id string instead of crashing.

---

## 7. Frontend: `CustomerChat.tsx` integration

Changes confined to the `isEmpty` block (current lines ~590–634):

1. Extend the existing `SpaceInfo` fetch (already calls `/api/v1/space/public/{slug}`) to also capture `homepage_sections` and `section_overrides` into new state.
2. Determine `device` client-side (`window.innerWidth` or existing responsive breakpoint logic) and `visitor_type` from the existing session/localStorage mechanism already used for chat continuity (`chat-theme` pattern shows localStorage is already used this way) — pass both as query params on the existing fetch call.
3. Replace the hardcoded JSX in the `isEmpty` block with `<SectionRenderer sections={homepageSections} overrides={sectionOverrides} space={space} suggestions={suggestions} onSend={send} />` imported from `ui/src/renderengine/homepage`.
4. If `homepage_sections` is empty/unset (e.g. fetch still in flight, or pre-migration chatbot), render exactly today's hardcoded hero+chips — i.e. the default list `["hero", "suggested_questions"]` must produce visually identical output to what exists today. This guarantees zero regression for the common/fallback path.

**Verify:** open a test chatbot's `/:slug` in the browser before sending a message — confirm identical appearance to current production when no override/AI data is present (default path); confirm section swap when a mocked API response includes a different section list.

---

## 8. Frontend: `ChatbotProfile.tsx` admin override UI

New card in the existing per-chatbot settings panel (alongside the existing logo/name/description/color editors, following their established pattern: draft state → save button → `apiClient` call → toast/`saved` flag):

- Checkbox list (or drag-to-reorder) of `ALLOWED_SECTIONS` to include/exclude/order.
- For `promo`: a text field, only meaningful when `promo` is checked.
- "Use AI recommendation" toggle — when on, clears the override (`sections: null`) and the field list is disabled/greyed to make it visually clear the AI is in control.
- Calls `apiClient.updateChatbot()` with the new `homepage_sections_override` field (same `PATCH /api/v1/chatbots/{slug}` endpoint from step 5, no new route).

**Verify:** set an override, reload `/:slug` in another tab, confirm the override renders and no LLM call fires (check backend logs for absence of the LLM log line); clear the override, confirm it reverts to AI/default behavior.

---

## 9. Rollout

1. Ship schema migration + backend service + default-path frontend change (step 7.4 guarantees no visible change) — deploy with the feature computing sections but frontend still hardcoded, to validate the endpoint/cache/timeout behavior in production logs before it's visible to any customer.
2. Flip `CustomerChat.tsx` to actually use `SectionRenderer` for a small allowlist of test spaces first (env var or DB flag), confirm in real traffic.
3. Roll out to all spaces once the above is stable; enable the `ChatbotProfile` override UI at the same time so tenants have escape-hatch control from day one.

---

## 10. Open items to confirm during build (not blocking design sign-off)

- Exact FAQ data source for `FaqSection` — may need a small RAG query similar to `_sample_rag_content` in `chat_suggestions.py`, or can ship v1 without FAQ in the pool.
- Exact `llm_service.generate_with_fallback` prompt wording for section classification (draft during implementation, following the same system-prompt style as `chat_suggestions.py`).
- Whether `visitor_type`/`device` should also be logged to `ConversationLog` or similar for later analysis of which sections perform best — out of scope for v1 unless requested.

---

# Part B: Response-Driven Component Rendering

A separate rendering surface from Part A: not the pre-chat empty state, but rich components rendered alongside the bot's actual reply *during* the conversation (e.g. an order-status card next to the text answer). This uses the active runtime — `app/orchestra/ai/orchestrators/agno.py` (the legacy per-type agents in `app/agents/` like `finance_agent`/`order_agent` are not the live path).

## 1. Trigger & mechanism

No separate classification call. The agno agent's existing single generation turn — which already returns a structured dict (`reply`, `agent`, `intent`, `citations`, per `AgnoOrchestrator.run()` and `ChatResponse` in `app/api/chat.py`) — is extended to also emit a `component` field, using Agno's structured-output/response-model support. One LLM call produces both the text reply and the component recommendation; nothing new is added to the request path. The validation/typing logic (is this a known component type? does `fields` match its schema?) lives in `app/renderengine/response_components.py`, called from `agno.py` with the raw agent output — `agno.py`'s own diff is one function call, same pattern as Part A.

```python
# ChatResponse gains:
component: Optional[dict] = None   # {"type": "order_status", "fields": {...}} | None
```

## 2. Data model & admin override (disable switch)

Unlike Part A's granular section list, Part B needs only a simple on/off switch per bot — an admin who doesn't want their agents attaching cards at all (rather than picking which card types) can turn it off entirely.

**File:** `app/models/chatbot.py` — add one column, same migration batch as Part A's `homepage_sections_override`:

```python
# Per-bot kill switch for AI response components. Default True: once a space
# is in the rollout allowlist, its bots get components unless explicitly disabled.
response_components_enabled = Column(Boolean, default=True, nullable=False)
```

**Backend:** `app/renderengine/response_components.py`'s validator checks this flag before returning anything — if `False`, the `component` field is dropped (set to `None`) regardless of what the agent emitted, so a disabled bot behaves exactly as it does today (plain-text-only replies).

**Frontend (`ChatbotProfile.tsx`):** one new toggle in the same card added for Part A's section overrides (or its own small card if Part A hasn't shipped yet) — "AI response components" on/off, using the existing `Toggle` component and `apiClient.updateChatbot()` save pattern already used for `active`/`show_logo`. No new endpoint.

**Verify:** disable the flag for a test bot, trigger a response an agent would normally attach a card to, confirm `component` is `None` in the API response and the message renders as plain text.

---

## 3. Component model (v1 scope)

Fixed, developer-maintained pool of known types with typed fields — same safety model as the homepage sections (Section 3): the agent picks a `type` from a known enum and fills that type's defined schema (e.g. `order_status: {order_id, status, eta}`). No raw HTML/JSX/code from the agent, ever.

For a `type` the agent emits that isn't in the known pool (agents may be reconfigured per-space with new prompts/intents over time), the frontend falls back to a generic `DynamicFieldCard` — renders the `fields` object as label/value rows using the existing design system. This gives forward-compatibility (a newly-configured agent's output displays reasonably immediately) without any code execution or new attack surface. Frequently-seen unknown types can later be promoted into real purpose-built components once real usage is observed.

**Explicitly out of scope for this plan:** true dynamic JSX/code generation (agent emits actual React code, transpiled and executed client-side via Babel standalone / `react-live`). This is a real, proven technique (it's how Vercel's AI SDK Generative UI and v0.dev work) but requires a non-trivial client bundle, a scoped/sandboxed execution context so generated code can't reach `fetch`/cookies/`localStorage`/arbitrary DOM, and an error boundary so a bad generation can't crash the widget. Given tenants in this product are finance-adjacent (the HDFC Life / SBI examples used throughout this design), a prompt-injected KB document or crafted user message becoming executable code in another customer's session is a real threat class. If wanted later, scope it as its own phase with a dedicated security review — do not fold it into this build.

## 4. Backend changes

- **New:** `app/renderengine/response_components.py` (extends `app/renderengine/base.py`) — holds `ALLOWED_RESPONSE_COMPONENTS`, the `response_components_enabled` check from §2, and the validation function: checks the agent's emitted `type` against the known pool, checks `fields` against that type's schema, passes through unrecognized `type` values unchanged (frontend fallback handles those) rather than dropping them.
- `app/orchestra/ai/orchestrators/agno.py` (existing, minimal diff): extend the agent's structured output schema (Agno response model) to include optional `component: {type: str, fields: dict}`; call `app/renderengine/response_components.py`'s validator on it before returning.
- `app/api/chat.py` (existing, minimal diff): add `component: Optional[dict] = None` to `ChatResponse`; thread it through from the orchestrator's returned dict alongside `reply`/`agent`/`intent`.

## 5. Frontend changes

**New directory:** `ui/src/renderengine/response/`

- One file per known type (`OrderStatusCard.tsx`, etc.) plus `DynamicFieldCard.tsx` (the fallback).
- `registry.ts`: `type → Component` map, mirroring the backend's `ALLOWED_RESPONSE_COMPONENTS`; unknown `type` routes to `DynamicFieldCard`. `index.ts` re-exports the renderer.
- `CustomerChat.tsx` (existing, minimal diff): `Message` interface gains `component?: {type: string; fields: Record<string, unknown>}`; render it below the message bubble (in the existing message-thread block, ~line 636 onward) via the renderer imported from `ui/src/renderengine/response`, when present.

## 6. Verify

- Unit test: agent structured output with a known `type` → validated and passed through unchanged; unknown `type` → still passed through (not dropped), frontend registry test confirms it resolves to `DynamicFieldCard`; missing/malformed `component` → `None`, message renders as plain text exactly as it does today (zero regression path).
- Manual QA: trigger a response from an agent configured to emit `order_status`, confirm the typed card renders with correct fields; temporarily configure an agent to emit an unrecognized type string, confirm `DynamicFieldCard` renders the raw fields without crashing.
