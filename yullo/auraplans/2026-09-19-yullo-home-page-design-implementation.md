# Yullo Home Page Design Implementation Plan

> **For agentic workers:** Implement this plan task by task. Keep Yullo frontend, state, routes, API contracts, and styling isolated from Support247. Track progress with the checkboxes in this document.

**Goal:** Replace the authenticated `/yullo/home` placeholder with a calm, editorial Home that shows a user's Spaces, meaningful attention items, recent human-readable activity, and one contextual next action.

**Architecture:** Add one authenticated Yullo Home read endpoint that resolves the current user server-side and returns a strict, bounded view model across only that user's Yullo Spaces. Build the page entirely inside `ui/src/yullo`, with Yullo-owned components, primitives, API client, query hooks, state, app theme, scoped design tokens, and restrained motion. Use revocable server-side Yullo sessions with secure cookies and CSRF protection. Keep the public marketing page and public Space/Aura experience separate.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Zustand, Zod, Tailwind/CSS variables, Motion for React (`motion` package), Radix primitives, Lucide, FastAPI, Pydantic v2, SQLAlchemy, PostgreSQL.

**Source design:** User-supplied “Yullo Home — design direction” containing the complete 47-point Home definition.

**Related architecture:** `yullo/auraplans/2026-09-18-aura-backend-implementation.md`

## Reuse boundary

Backend integration may reuse neutral identity, Space, knowledge, ingestion, conversation, usage and evaluation primitives through Yullo services. The Home frontend does not reuse Support247 screens, stores, dashboard DTOs, API clients, render blocks, theme state, or business components. It may use installed framework libraries and verified product-neutral utilities only. `ui/src/yullo/` owns the complete Home experience and receives a Yullo-specific view model.

This design plan does not authorize duplicate persistence. Home reads shared canonical records, while only Yullo-specific preferences and redacted domain events use `yullo_*` tables. The working-tree `yullo_sources` implementation is transitional. No `yullo_aura_turns` model/migration remains after the revert; if such a table exists in an external database, it must be migrated away and must never become a frontend dependency.

---

## 1. Product decision

Home answers one question:

> **What is happening with my Yullo presence right now?**

Home is a personal operating surface across the user's Yullo Spaces. It is not an editor, analytics dashboard, Aura configuration screen, public Space preview, or Support247 dashboard.

The final hierarchy is fixed:

1. Minimal header: Yullo identity, theme control, account menu.
2. Restrained time-aware greeting and context sentence.
3. One-Space feature or multi-Space editorial list.
4. Meaningful attention items.
5. Human-readable recent activity.
6. One contextual suggestion.

The visual character is calm, premium, spacious, editorial, and slightly alive. Typography, whitespace, thin dividers, identity marks, concise status, and subtle network behavior carry the page.

## 2. Existing-state findings

- `ui/src/yullo/screens/YulloHome.tsx` is the public Yullo marketing page at `/yullo`. Keep it unchanged.
- `ui/src/yullo/screens/YulloDashboard.tsx` is a temporary authenticated placeholder at `/yullo/home`. Replace it and remove the placeholder copy.
- `App.tsx` currently protects `/yullo/home` with the shared `PrivateRoute`, which redirects to Support247 `/app/login` and `/app/onboarding`. A Yullo-specific guard is required.
- The shared `useAppStore` mixes Support247 authentication, dashboard theme, navigation, chatbot state, and Yullo state in one persisted key. Home must not add more Yullo behavior to that store.
- Yullo authentication currently returns a bearer JWT to browser code as well as setting `yullo_session`; `current_user` accepts either. It has no revocable session record, authenticated bootstrap, or logout endpoint. Home must not ship on that browser-persisted token pattern.
- The current Google endpoint trusts caller-supplied `google_sub`, email, and name. Production authentication must verify a real Google ID token server-side before using those claims.
- OTP responses/logging currently expose development codes. That behavior must be impossible outside an explicit local-development configuration.
- No Yullo-specific Home summary endpoint exists. The Support247 dashboard endpoint must not be reused.
- Current Yullo backend migrations are still moving toward explicit runtime identity, Aura IDs, versioned Space entities/evidence, and Yullo-owned Space state. Home activity and status depend on those reviewed contracts.
- Satoshi is locally loaded. Instrument Sans is configured but must be verified as actually loaded; add a local asset or approved import if it currently falls back.
- TanStack Query, Zod, Radix Dialog/Popover/Tooltip, Motion, Lucide, React Hook Form, and react-dropzone are already installed. Do not add a pre-styled component library.

## 3. Global constraints

- A user may own zero, one, or multiple Yullo Spaces; each Space owns its own isolated Aura.
- Frontend isolation is strict. Yullo Home must not import from `ui/src/components`, `ui/src/screens`, `ui/src/features`, `ui/src/renderengine`, `ui/src/store`, or Support247 configuration/theme modules. Framework packages and raw font/image assets may be used, but every product component, primitive, client, hook, store, layout, token, and style is Yullo-owned.
- The only shared frontend integration point is the top-level React router required to mount the isolated Yullo bundle. Yullo Home creates its own nested Query client/provider so account data and cache lifecycle are not shared with Support247.
- Every backend query includes authenticated `owner_user_id` and `product="yullo"` scope. Never trust a browser-supplied user ID or Space ID as authorization.
- Do not read Support247 chatbot state, dashboard endpoints, render blocks, themes, or stores.
- Home data is derived from persisted lifecycle/events. Do not use an LLM to invent activity, attention, status, or suggestions.
- Suggestions use a deterministic, config-driven, pluggable rule registry and return at most one item.
- Home actions use typed action keys and opaque IDs. The server does not send arbitrary URLs.
- The public Space preview retains its own Space appearance and never inherits the management app theme.
- Light, Warm, Dark, and System are the supported app preferences. Only Light, Warm, and Dark appear as direct choices; System may appear as a secondary choice in the popover/settings.
- Yellow is reserved for Aura state, important actions, live/published identity, and small signature moments.
- No KPI grid, glassmorphism, large sidebar, analytics chart, profile-completion score, constant network animation, nested cards, repeated rounded panels, or AI sparkle decoration.
- Do not decide global mobile navigation in this task. Reserve safe bottom spacing so a later compact or bottom navigation can be added.
- All async sections support loading, empty, partial-error, retry, and stale-data states without replacing the entire page with a spinner.
- Respect `prefers-reduced-motion`, keyboard navigation, visible focus, semantic headings, screen readers, and WCAG AA contrast.
- Do not use `dangerouslySetInnerHTML` for Home content. Render all server text as text nodes and map actions through a closed frontend action registry.
- Authenticated Home responses use `Cache-Control: no-store`; service workers and browser persistence must not cache account/Home payloads.

---

## 4. Information and domain model

### 4.0 Revocable Yullo session

Do not use the existing long-lived browser-visible bearer token for authenticated Home. Add a Yullo-owned server session:

| Column | Type | Rules |
|---|---|---|
| `id` | UUID PK | Internal session identity. |
| `user_id` | UUID FK | References `users.id`, cascade delete, indexed. |
| `token_hash` | CHAR(64) | Unique SHA-256 hash of a 256-bit random token; raw token exists only in the cookie. |
| `csrf_hash` | CHAR(64) | Hash of the session-bound CSRF token. |
| `created_at` | TIMESTAMPTZ | Required. |
| `last_seen_at` | TIMESTAMPTZ | Updated with bounded frequency. |
| `expires_at` | TIMESTAMPTZ | Required, enforced on every request. |
| `revoked_at` | TIMESTAMPTZ nullable | Logout/security revocation. |
| `user_agent_hash` | CHAR(64) nullable | Optional coarse anomaly signal; never an authorization factor. |

Production cookie requirements:

```text
name: __Host-yullo_session
HttpOnly: true
Secure: true
SameSite: Lax
Path: /
Domain: omitted
```

Local HTTP development uses a clearly separate cookie name and `Secure=false` only when `ENVIRONMENT=development`. Never silently weaken production settings.

The CSRF token is returned by authenticated bootstrap, kept in memory, and sent as `X-Yullo-CSRF` for every state-changing request. The backend compares its hash using constant-time comparison and validates `Origin`/`Referer` against configured Yullo origins. Login rotates any prior session; logout revokes the record and clears the cookie.

### 4.1 User-level preference

App theme belongs to the Yullo user, not a Space. Extend the existing `yullo_user_preferences` model rather than storing the preference in shared Support247 settings, `spaces`, or Space-scoped `yullo_configs`.

| Column | Type | Rules |
|---|---|---|
| `user_id` | UUID PK/FK | References `users.id`, cascade delete. |
| `app_theme` | VARCHAR(20) | `system`, `light`, `warm`, or `dark`; default `system`. |
| `timezone` | VARCHAR(64), nullable | Future-friendly IANA timezone; Home uses browser timezone until set. |
| `created_at` | TIMESTAMPTZ | Required. |
| `updated_at` | TIMESTAMPTZ | Required. |

Do not store public Space appearance here.

### 4.2 Home summary contract

`GET /api/v1/yullo/home` returns a bounded snapshot:

```json
{
  "account": {
    "id": "uuid",
    "displayName": "Akhil",
    "initials": "AS"
  },
  "preference": {
    "appTheme": "system"
  },
  "spaces": [
    {
      "id": "uuid",
      "name": "Northstar Studio",
      "slug": "northstar",
      "description": "Brand and product design",
      "logoUrl": null,
      "lifecycle": "live",
      "auraStatus": "live",
      "conversationCountToday": 3,
      "newConversationCount": 3,
      "attentionCount": 0,
      "lastActivityAt": "2026-09-19T08:00:00Z"
    }
  ],
  "attention": [],
  "recent": [],
  "suggestion": null,
  "generatedAt": "2026-09-19T08:05:00Z"
}
```

All response schemas forbid extra fields. Lists are bounded: Spaces use an explicit product limit policy, attention returns at most 5, recent returns at most 8, and suggestion returns zero or one.

### 4.3 Space status

Frontend status is a strict union:

```text
draft | learning | updating | live | needs_review | unavailable
```

The backend derives it in this order:

1. `draft` when onboarding/publication is incomplete.
2. `needs_review` when a blocking conflict or owner review exists.
3. `updating` when an active source ingestion/publication job is running.
4. `learning` when initial sources exist but no published Aura version is ready.
5. `live` when a published Aura version is active.
6. `unavailable` only for a real operational failure.

The browser never infers Aura state from missing fields.

### 4.4 Attention item

```ts
type HomeAttentionItem = {
  id: string
  spaceId: string
  spaceName: string
  kind: 'knowledge_conflict' | 'source_failed' | 'source_stale' |
        'missing_action' | 'publication_blocked' | 'aura_unavailable'
  title: string
  detail?: string
  action: {
    kind: 'review_knowledge' | 'retry_source' | 'add_action' |
          'review_publication' | 'open_space'
    label: string
    targetId?: string
  }
  occurredAt: string
}
```

IDs are stable and based on the persisted source/fact/entity/turn that caused the item. Do not generate random IDs on every request. The frontend maps action kinds to known owner routes or mutations and never executes a server-provided URL.

### 4.5 Activity item

```ts
type HomeActivityItem = {
  id: string
  spaceId: string
  spaceName: string
  kind: 'conversation_started' | 'enquiry_received' |
        'source_updated' | 'aura_published' | 'space_explored'
  label: string
  occurredAt: string
  isNew: boolean
}
```

Use server-authored templates with persisted nouns/counts. Never include visitor message text, email, phone, source passages, internal reasoning, or unbounded event metadata. Examples:

- “Someone asked Northstar about pricing” only when a safe classified intent such as `pricing` exists.
- Otherwise use “Someone spoke with Northstar.”
- “A new enquiry came in.”
- “Aura learned from your updated website.”
- “14 people explored Offers.Run today.”

### 4.6 Suggestion

```ts
type HomeSuggestion = {
  id: string
  spaceId: string
  spaceName: string
  kind: 'continue_setup' | 'add_sources' | 'review_knowledge' |
        'add_offering' | 'add_booking_action' | 'add_location' |
        'customize_appearance'
  reason: string
  actionLabel: string
}
```

Rules are ordered configuration, not request-time AI. Suggested priority:

1. Continue an incomplete draft.
2. Resolve a blocking knowledge/publication issue.
3. Add the first trusted source.
4. Add offerings or actions required by frequent supported intents.
5. Add a booking action when consultation intent is frequent and no confirmed booking action exists.
6. Add location when relevant to Space purpose and absent.
7. Customize appearance after knowledge and actions are usable.

If no meaningful rule matches, omit the entire Suggested section.

---

## 5. Visual specification

### 5.1 Desktop composition

Use a centered editorial column:

```css
max-width: 1180px;
padding-inline: clamp(24px, 5vw, 72px);
```

Target spacing:

| Relationship | Space |
|---|---:|
| Header to greeting | 56–72px |
| Greeting to Spaces | 52–64px |
| Between Space rows | 28–40px |
| Spaces to attention | 64–80px |
| Attention to recent | 56–72px |
| Recent to suggestion | 48–64px |

There is no enclosing dashboard panel. Dividers and whitespace create structure.

### 5.2 Header

Desktop:

```text
YULLO                                      ◐      AS
```

- Left: wordmark linking to `/yullo/home`.
- Right: theme icon button and initials/avatar account button.
- No sidebar, breadcrumb, search, persistent Create button, or workspace switcher.
- Theme button opens a Radix Popover.
- Account menu contains account identity and Sign out. Archive/delete belongs elsewhere.

### 5.3 Greeting

Use local time without sending timezone to the server:

```text
Good evening, Akhil.
Here’s what’s happening across your spaces.
```

If no usable first name exists, render “Good evening.” Do not expose an email/phone as the greeting name.

### 5.4 Zero, single, and multiple Space layouts

**Zero Spaces:** a short empty state, one sentence, and one `Create Space` primary action to `/yullo/onboarding`. No illustration wall or empty dashboard frame.

**One Space:** feature the Space identity directly without an unnecessary “Your Spaces” collection wrapper. Show name, description, public URL, Aura status, one human activity line, and `Open Space →`, followed immediately by attention, recent, and suggestion.

**Multiple Spaces:** render `Your Spaces` and editorial rows separated by faint dividers. Each row contains avatar/node, name, description, URL where space permits, status/context, and one right arrow. The row opens the owner Space route. `+ Create another Space` sits beneath the list.

Owner route contract:

```text
/yullo/home/spaces/{spaceId}
```

Home may link to this route, but detailed Space management is a separate plan. If the destination shell is not implemented when Home ships, provide a minimal route boundary with a clear “Space management is being prepared” state rather than redirecting owners into Support247.

### 5.5 Space row interaction

At rest, the row is flat. On hover/focus-visible:

- name translates `2px` on x;
- arrow translates `3px` on x;
- identity node/logo becomes slightly more vivid;
- a near-transparent horizontal network trace may appear;
- background may receive a neutral wash around 2.5% opacity;
- the row never scales, lifts, gains a box shadow, or becomes a large rounded card.

The complete row is one semantic link. Secondary actions live in a keyboard-accessible ellipsis menu and must not create nested interactive elements inside the link.

### 5.6 Aura state

- `live`: yellow center with slow opacity `0.75 → 1 → 0.75` over 4–6 seconds.
- `learning`: one muted cyan pulse travels toward the yellow center.
- `updating`: one short connection animation when state changes.
- `needs_review`: static warm amber/yellow marker.
- `draft`: quiet neutral outlined node.
- `unavailable`: subdued error treatment; reserve red for a confirmed severe failure.

Do not animate all nodes continuously. Optional ambient pulse occurs at most once every 8–12 seconds.

### 5.7 Attention, recent, and suggested

Attention is visually stronger than analytics but remains list-like. It uses concise title, optional evidence summary, and a text action such as `Review →`. When empty, render only:

```text
Everything looks good.
Aura is up to date.
```

Recent is a quiet timeline with dot, optional connector, sentence, and relative time. It is never converted to visitor/chat/lead metric cards.

Suggested contains one reason and one text action. No completion percentage, gamification, or carousel.

### 5.8 Typography

- Satoshi: wordmark, greeting, Space names, larger identity text.
- Instrument Sans: body, controls, status, metadata, activity, timestamps.

| Role | Size |
|---|---:|
| Greeting | 30–34px |
| Space name | 26–32px |
| Section heading | 14–16px |
| Body | 15–16px |
| Metadata | 13–14px |
| Timestamp | 12–13px |

Use title case section labels: `Your Spaces`, `Needs attention`, `Recent`, `Suggested`. Avoid making every label uppercase.

### 5.9 Theme tokens

Scope tokens to the authenticated Yullo management root, for example `[data-yullo-app-theme]`. Do not set a generic `data-theme` on `html` because Support247 and public Space appearance share the React application.

Required semantic tokens:

```css
--canvas;
--surface;
--surface-soft;
--text-primary;
--text-secondary;
--text-muted;
--border;
--accent-yullo;
--accent-yullo-soft;
--network-cyan;
--network-violet;
--attention;
--focus-ring;
--radius-sm;
--radius-md;
--shadow-soft;
```

**Light**

```text
Canvas          #F6F7F5
Surface         #FFFFFF
Surface soft    #EEF1F3
Text primary    #171B22
Text secondary  #69707C
Border          rgba(20,25,35,.08)
Yellow          #F3DC39
Soft yellow     #FFF7BE
```

**Warm**

```text
Canvas          #F3EFE6
Surface         #FBF8F1
Surface soft    #ECE6DB
Text primary    #25221D
Text secondary  #756F65
Border          rgba(50,43,33,.09)
Yellow          #E8D238
Soft yellow     #F7EDB4
Network cyan    muted aqua
Network violet  muted lilac
```

**Dark**

```text
Canvas          #111318
Surface         #181B21
Surface soft    #1F232B
Text primary    #F3F4F6
Text secondary  #9AA1AD
Border          rgba(255,255,255,.08)
Yellow          #F1DB3D
Soft yellow     rgba(241,219,61,.12)
Network cyan    #65BCD9
Network violet  #9586E8
```

Theme switch is immediate in state, persists optimistically, and does not reload. Canvas and inherited colors transition over 200–260ms. Do not animate every descendant independently. `system` follows `prefers-color-scheme` and reacts to operating-system changes.

### 5.10 Motion

Use one shared easing:

```ts
[0.22, 1, 0.36, 1]
```

- Page entrance: opacity `0 → 1`, y `8 → 0`, 240ms.
- Greeting begins around 50ms.
- Spaces begins around 110ms.
- Attention/recent begins around 170ms.
- New activity: opacity `0 → 1`, y `-4 → 0`, 200ms; no flash.
- Resolved attention: fade, softly collapse height, then crossfade empty state if needed.
- Optional Space context switch stays below 350ms.
- Signature moment: over 500–700ms, a faint line connects account identity to active Space nodes once, then disappears. Run once per page mount, never loop.

Reduced motion removes pulse travel, breathing scale, connection animation, and y transforms. Retain simple opacity or immediate state changes.

### 5.11 Components and controls

- Primary button: only Create Space/Continue setup level actions.
- Text action: default for Review/Open/Add actions.
- Icon action: theme, ellipsis, external link.
- Inputs: label above, 44–48px high, 10px radius, subtle border, clear focus, inline error.
- Textarea: same family, no deep inset gray treatment.
- Select/Popover: Radix behavior, Yullo appearance.
- Switch: compact and used only for true binary settings.
- Dialog: rare, 440–520px, 14–16px radius, subtle overlay/shadow.
- Toast: quiet bottom-center or bottom-right feedback such as `Theme updated` or `Link copied`.
- Icons: sparse Lucide icons; navigation depends primarily on words.

### 5.12 Responsive behavior

- Desktop and tablet preserve the editorial column and generous rhythm.
- Mobile uses one natural flow, no horizontal scroll, no compressed dashboard grid.
- Space metadata wraps below identity; arrow remains aligned to the primary action.
- Attention detail wraps before its action.
- Recent timestamps remain visible but never squeeze the sentence below a readable width.
- Minimum interactive target is 44×44px.
- Reserve bottom safe-area padding with `env(safe-area-inset-bottom)` plus space for future navigation.
- Public URL may be visually shortened but accessible name includes the complete destination.

### 5.13 Loading and failure

- Use structural editorial skeleton lines and dividers, not skeleton cards or shimmer blocks.
- Render the header/theme immediately from cached preference.
- If Home summary fails, show `We couldn't load your Yullo Home. Try again →` with a retry action.
- If only one optional section fails, keep Spaces visible and show a local retry for that section when the API is later split.
- Preserve last successful data during background refresh and indicate no disruptive full-page loading state.
- A stale timestamp is internal; do not show technical cache language to users.

---

## 6. File structure

### Backend

```text
app/models/yullo_user_preference.py
app/models/yullo_user_session.py
app/schemas/yullo_home.py
app/yullo/api/home.py
app/yullo/services/auth/session_service.py
app/yullo/services/home/service.py
app/yullo/services/home/status.py
app/yullo/services/home/attention.py
app/yullo/services/home/activity.py
app/yullo/services/home/suggestions.py
app/yullo/config/home_rules.py
alembic/versions/0067_add_yullo_sessions_and_preferences.py
```

Each module has one responsibility. `service.py` orchestrates bounded queries and delegates classification. Rule modules cannot query another tenant or return arbitrary presentation markup.

### Frontend

```text
ui/src/yullo/api/client.ts
ui/src/yullo/api/home.ts
ui/src/yullo/api/schemas/home.ts
ui/src/yullo/api/schemas/session.ts
ui/src/yullo/state/useYulloAppStore.ts
ui/src/yullo/providers/YulloAppProviders.tsx
ui/src/yullo/components/primitives/YulloButton.tsx
ui/src/yullo/components/primitives/YulloIconButton.tsx
ui/src/yullo/components/primitives/YulloInput.tsx
ui/src/yullo/components/primitives/YulloTextarea.tsx
ui/src/yullo/components/primitives/YulloSelect.tsx
ui/src/yullo/components/primitives/YulloSwitch.tsx
ui/src/yullo/components/primitives/YulloPopover.tsx
ui/src/yullo/components/primitives/YulloMenu.tsx
ui/src/yullo/components/primitives/YulloDialog.tsx
ui/src/yullo/components/primitives/YulloToast.tsx
ui/src/yullo/theme/YulloAppThemeProvider.tsx
ui/src/yullo/theme/tokens.css
ui/src/yullo/theme/motion.ts
ui/src/yullo/routes/YulloPrivateRoute.tsx
ui/src/yullo/screens/home/YulloHomePage.tsx
ui/src/yullo/screens/home/components/HomeHeader.tsx
ui/src/yullo/screens/home/components/HomeGreeting.tsx
ui/src/yullo/screens/home/components/SpacesSection.tsx
ui/src/yullo/screens/home/components/SingleSpaceFeature.tsx
ui/src/yullo/screens/home/components/SpaceRow.tsx
ui/src/yullo/screens/home/components/SpaceStatus.tsx
ui/src/yullo/screens/home/components/AttentionSection.tsx
ui/src/yullo/screens/home/components/ActivitySection.tsx
ui/src/yullo/screens/home/components/SuggestionSection.tsx
ui/src/yullo/screens/home/components/ThemeSwitcher.tsx
ui/src/yullo/screens/home/components/AccountMenu.tsx
ui/src/yullo/screens/home/components/NetworkSignal.tsx
ui/src/yullo/screens/home/components/HomeSkeleton.tsx
ui/src/yullo/screens/home/components/HomeError.tsx
ui/src/yullo/screens/home/hooks/useYulloHome.ts
ui/src/yullo/screens/home/lib/homeActions.ts
ui/src/yullo/screens/home/lib/formatHomeTime.ts
```

Do not create generic `DashboardCard`, `MetricCard`, `StatsCard`, or `WidgetCard` abstractions.

---

## 7. Implementation tasks

### Task 1: Complete the Home and authentication preflight

**Files:**

- Review: `yullo/auraplans/2026-09-18-aura-backend-implementation.md`
- Review: `app/models/chat.py`
- Review: `app/models/conversation_event.py`
- Review: `app/api/v1/yullo_auth.py`
- Review: `ui/src/App.tsx`

**Interfaces:**

- Consumes: reviewed Yullo Space/Aura identity and authenticated `User`.
- Produces: a written checklist in this plan's implementation PR confirming dependencies.

- [ ] Confirm `runtime_type="aura"`, `runtime_id`, and generic `runtime_version_id` exist as constrained shared fields before deriving Aura activity.
- [ ] Confirm every Space query can enforce both `owner_user_id` and `product="yullo"`.
- [ ] Confirm published/preview Aura state can be resolved server-side.
- [ ] Confirm source/entity/evidence lifecycle is trustworthy enough to create attention items.
- [ ] Confirm the Alembic graph has one head before assigning the `0067` down revision; rename the migration if the actual next revision differs.
- [ ] Confirm production Yullo origins, cookie host/path, session lifetime, and Google OAuth audience are environment-backed configuration.
- [ ] Find and remove every Yullo frontend read/write of the shared `useAppStore` token and Space identity as part of Tasks 7–8.
- [ ] Confirm OTP development codes are disabled in responses and logs outside explicit local development.
- [ ] Do not add temporary browser-supplied Space identity or Support247 dashboard fallbacks when a dependency is missing.

### Task 2: Add revocable Yullo server sessions

**Files:**

- Review/modify: `app/models/yullo_user_session.py`
- Review/modify: `app/yullo/services/auth/session_service.py`
- Modify: `app/models/user.py`
- Modify: `app/models/__init__.py`
- Modify: `app/config.py`
- Review/modify: `alembic/versions/0067_add_yullo_sessions_and_preferences.py`

**Interfaces:**

- Produces: `create_yullo_session`, `resolve_yullo_session`, `validate_yullo_csrf`, `revoke_yullo_session`, and `clear_yullo_session_cookie`.

- [ ] Generate session and CSRF secrets with a cryptographically secure random generator; persist hashes only.
- [ ] Resolve the authenticated user exclusively from the session cookie for Yullo owner routes.
- [ ] Reject missing, expired, revoked, or malformed sessions with the same generic 401 response.
- [ ] Rotate the session after every successful login and revoke the prior session when identifiable.
- [ ] Require session-bound CSRF plus allowed Origin/Referer for PATCH/POST/PUT/DELETE owner requests.
- [ ] Apply production `__Host-` cookie requirements and a separate local-development cookie configuration.
- [ ] Add bounded per-user active sessions and periodic cleanup of expired/revoked records.
- [ ] Never log raw session tokens, CSRF tokens, OTPs, authorization headers, or cookies.

### Task 3: Add Yullo user preferences

**Files:**

- Review/modify: `app/models/yullo_user_preference.py`
- Modify: `app/models/user.py`
- Modify: `app/models/__init__.py`
- Review/modify: `alembic/versions/0067_add_yullo_sessions_and_preferences.py`; add Home-section fields in the next chained revision rather than recreating the table.

**Interfaces:**

- Produces: `YulloUserPreference(user_id, app_theme, timezone)`.
- Consumes: shared authenticated `User` identity only.

- [ ] Create the one-to-one model and relationship.
- [ ] Add a database check constraint for `system | light | warm | dark`.
- [ ] Backfill no rows; absence means the default `system` preference.
- [ ] Keep this table Yullo-owned and do not add theme columns to `users`, `spaces`, or Support247 settings.
- [ ] Verify upgrade and downgrade against the current migration head.

### Task 4: Define strict Home schemas

**Files:**

- Create: `app/schemas/yullo_home.py`

**Interfaces:**

- Produces: `YulloHomeResponse`, `YulloHomeSpace`, `YulloHomeAttention`, `YulloHomeActivity`, `YulloHomeSuggestion`, `YulloPreferenceResponse`, and `YulloPreferenceUpdate`.

- [ ] Implement literal enums/unions from Section 4.
- [ ] Bound names, labels, descriptions, list sizes, and optional detail text.
- [ ] Use camelCase aliases consistently for the frontend response.
- [ ] Set `extra="forbid"` on requests and responses.
- [ ] Ensure action contracts contain action kind and opaque target ID only.
- [ ] Exclude internal knowledge IDs, raw messages, source passages, review metadata, model names, and cost data.

### Task 5: Build the isolated Home read service

**Files:**

- Create: `app/yullo/services/home/service.py`
- Create: `app/yullo/services/home/status.py`
- Create: `app/yullo/services/home/attention.py`
- Create: `app/yullo/services/home/activity.py`
- Create: `app/yullo/services/home/suggestions.py`
- Create: `app/yullo/config/home_rules.py`

**Interfaces:**

- Produces: `get_yullo_home(user_id: UUID, now: datetime) -> YulloHomeResponse`.
- Consumes: Yullo Space/Aura lifecycle, source state, versioned Space entities/evidence, and redacted Yullo events.

- [ ] Query only owned Yullo Spaces in a stable order: recent activity first, then creation order as tie-breaker.
- [ ] Join through authenticated ownership inside each query; never fetch a Space by ID and authorize it afterward.
- [ ] Avoid per-Space query loops; use bounded grouped queries or loaders.
- [ ] Implement status derivation in the fixed precedence from Section 4.3.
- [ ] Implement attention adapters as independent rule functions returning typed candidates.
- [ ] Implement activity projection from redacted events and safe server templates.
- [ ] Calculate relative counts using UTC boundaries; return timestamps and let the browser format relative time.
- [ ] Implement suggestion rules as ordered config with one result maximum.
- [ ] Guarantee deterministic output for identical persisted state.
- [ ] Return empty lists/`null` when no fact supports a section; never fill gaps with guesses.

### Task 6: Harden Yullo login and add authenticated Home endpoints

**Files:**

- Create: `app/yullo/api/home.py`
- Modify: `app/api/v1/yullo_auth.py`
- Modify: `app/core/auth.py` only to route Yullo owner auth to the isolated session dependency
- Modify: `app/api/v1/yullo_onboarding.py`
- Replace: provisional `app/api/v1/yullo_resources.py` with Yullo entity command routes after migration
- Review/modify: every non-public route under `app/yullo/api/`
- Modify: Google/OTP provider adapters used by Yullo auth
- Modify: `app/main.py`

**Interfaces:**

- Produces:
  - `GET /api/v1/yullo/auth/me`
  - `POST /api/v1/yullo/auth/logout`
  - `GET /api/v1/yullo/home`
  - `PATCH /api/v1/yullo/preferences`

- [ ] Replace caller-supplied Google identity claims with server verification of the provider ID token, issuer, signature, audience, expiry, and nonce/state where applicable.
- [ ] Return OTP development codes only under an explicit local-only setting; remove OTP values from structured logs.
- [ ] Stop returning bearer tokens to browser code. Successful auth returns bounded account/routing state and sets the server session cookie.
- [ ] Resolve owner identity through the isolated Yullo session dependency; never accept `user_id` in any request.
- [ ] Migrate every authenticated Yullo onboarding/entity/owner route to the same session dependency; do not leave mixed JWT and server-session authorization paths.
- [ ] Make `/auth/me` return bounded account identity, Space count, per-Space onboarding routing state, app preference, and an in-memory CSRF token.
- [ ] Make logout require CSRF, revoke the session, and clear the cookie with exactly matching attributes.
- [ ] Make Home return the strict snapshot and private `Cache-Control: no-store`.
- [ ] Make preference mutation require CSRF and validate/upsert only user-level Yullo preferences.
- [ ] Apply appropriate authenticated rate limiting without sharing public Aura rate-limit identity.
- [ ] Allow credentialed CORS only for configured Yullo origins; never combine credentials with a wildcard origin.
- [ ] Return generic auth failures and avoid leaking whether a user/session/Space exists.
- [ ] Add Yullo-route security headers: `X-Content-Type-Options: nosniff`, a restrictive referrer policy, frame protection/CSP `frame-ancestors`, and a CSP compatible with the actual Vite asset strategy.
- [ ] Register the router under `/api/v1/yullo` without changing Support247 routes.

### Task 7: Create the Yullo-only frontend API boundary and primitives

**Files:**

- Create: `ui/src/yullo/api/client.ts`
- Create: `ui/src/yullo/api/home.ts`
- Create: `ui/src/yullo/api/schemas/home.ts`
- Create: `ui/src/yullo/api/schemas/session.ts`
- Create: `ui/src/yullo/components/primitives/YulloButton.tsx`
- Create: `ui/src/yullo/components/primitives/YulloIconButton.tsx`
- Create: `ui/src/yullo/components/primitives/YulloInput.tsx`
- Create: `ui/src/yullo/components/primitives/YulloTextarea.tsx`
- Create: `ui/src/yullo/components/primitives/YulloSelect.tsx`
- Create: `ui/src/yullo/components/primitives/YulloSwitch.tsx`
- Create: `ui/src/yullo/components/primitives/YulloPopover.tsx`
- Create: `ui/src/yullo/components/primitives/YulloMenu.tsx`
- Create: `ui/src/yullo/components/primitives/YulloDialog.tsx`
- Create: `ui/src/yullo/components/primitives/YulloToast.tsx`

**Interfaces:**

- Produces: `getYulloSession`, `logoutYullo`, `getYulloHome`, and `updateYulloPreference`.

- [ ] Build a Yullo-owned client using its own environment-backed base URL and `credentials: 'include'`.
- [ ] Keep the CSRF token in memory only and attach it to all owner mutations.
- [ ] Do not depend on any Support247 component, primitive, `spaceId`, API key, chatbot ID, client, store, theme, or dashboard state.
- [ ] Implement Yullo-owned behavioral wrappers around Radix primitives; do not import shared application UI wrappers.
- [ ] Implement Yullo-owned form primitives with labels above controls, 44–48px height, 10px radius, muted borders, strong focus, inline errors, and React Hook Form/Zod compatibility.
- [ ] Keep textarea in the same family, Select visually minimal, Switch compact and binary-only, and Dialog 440–520px with 14–16px radius and subtle overlay.
- [ ] Keep toasts quiet at bottom-center or bottom-right and prevent unbounded notification stacking.
- [ ] Add a bounded request timeout and normalized `unauthorized | unavailable | invalid_response` errors.
- [ ] Parse every response with strict Zod schemas before components receive it.
- [ ] Pass TanStack Query cancellation signals through fetch.
- [ ] Never log cookie/token values or invalid response bodies.

### Task 8: Add isolated Yullo auth routing and state

**Files:**

- Create: `ui/src/yullo/state/useYulloAppStore.ts`
- Create: `ui/src/yullo/providers/YulloAppProviders.tsx`
- Create: `ui/src/yullo/routes/YulloPrivateRoute.tsx`
- Modify: `ui/src/App.tsx`
- Modify: Yullo auth success handlers under `ui/src/yullo/components/auth/`

**Interfaces:**

- Produces: Yullo account bootstrap state and correct product routes.

- [ ] Persist only non-sensitive Yullo preference/cache metadata under `yullo-app` or `yullo-app-dev`.
- [ ] Create a Yullo-owned `QueryClient` inside `YulloAppProviders`; clear it on logout/account change and never reuse the Support247 query cache.
- [ ] Remove bearer token handling from all Yullo auth success paths and never persist session or CSRF secrets.
- [ ] Bootstrap with `/yullo/auth/me` on protected route entry.
- [ ] Redirect unauthenticated users to `/yullo/auth` and users without any ready/draft Space to `/yullo/onboarding` according to server state.
- [ ] Replace the shared `PrivateRoute` on `/yullo/home` with `YulloPrivateRoute`.
- [ ] Keep `/yullo` mapped to the public marketing page and `/yullo/:handle` mapped to the public localhost Space route.
- [ ] Preserve the post-onboarding actions: View my Yullo Link, Go to Home, Copy link.
- [ ] Verify the Yullo bundle contains no imports from shared Support247 UI/state directories listed in Global Constraints.

### Task 9: Implement scoped Yullo app theming

**Files:**

- Create: `ui/src/yullo/theme/tokens.css`
- Create: `ui/src/yullo/theme/YulloAppThemeProvider.tsx`
- Create: `ui/src/yullo/theme/motion.ts`
- Add/import fonts and tokens from Yullo-owned files; do not add Yullo rules to Support247 component styles.

**Interfaces:**

- Produces: `YulloAppTheme = 'system' | 'light' | 'warm' | 'dark'` and resolved `light | warm | dark` tokens.

- [ ] Implement all semantic tokens and palettes from Section 5.9.
- [ ] Apply `data-yullo-app-theme` to the authenticated management shell only.
- [ ] Resolve System using `matchMedia` and subscribe to changes.
- [ ] Seed the initial theme from cached preference before Home paints to avoid a bright/dark flash.
- [ ] Update local state instantly, then persist preference; roll back and show a quiet toast only if persistence fails.
- [ ] Add 200–260ms inherited color transitions without layout animation.
- [ ] Verify public Aura preview and Support247 pages do not inherit these tokens.

### Task 10: Build the Home shell, header, theme control, and greeting

**Files:**

- Create: `ui/src/yullo/screens/home/YulloHomePage.tsx`
- Create: `ui/src/yullo/screens/home/components/HomeHeader.tsx`
- Create: `ui/src/yullo/screens/home/components/HomeGreeting.tsx`
- Create: `ui/src/yullo/screens/home/components/ThemeSwitcher.tsx`
- Create: `ui/src/yullo/screens/home/components/AccountMenu.tsx`
- Create: `ui/src/yullo/screens/home/hooks/useYulloHome.ts`

**Interfaces:**

- Produces: responsive page shell and the Home query.

- [ ] Use the exact editorial width and responsive padding.
- [ ] Build the minimal wordmark/theme/account header with semantic controls.
- [ ] Use Radix Popover for Appearance and accessible menu/dialog behavior for account actions.
- [ ] Render direct Light/Warm/Dark choices and secondary System.
- [ ] Derive greeting from browser local time and safe first name.
- [ ] Query with key `['yullo', 'home', accountId]`, a short stale time, focus refetch, and previous-data preservation.
- [ ] Make sign out call the server, clear Yullo-only cache/store, and navigate to `/yullo/auth`.

### Task 11: Build zero, single, and multiple Space presentation

**Files:**

- Create: `ui/src/yullo/screens/home/components/SpacesSection.tsx`
- Create: `ui/src/yullo/screens/home/components/SingleSpaceFeature.tsx`
- Create: `ui/src/yullo/screens/home/components/SpaceRow.tsx`
- Create: `ui/src/yullo/screens/home/components/SpaceStatus.tsx`
- Create: `ui/src/yullo/screens/home/components/NetworkSignal.tsx`

**Interfaces:**

- Consumes: validated `spaces` from Home response.
- Produces: the correct layout for 0, 1, or many Spaces.

- [ ] Implement the quiet zero-Space state and Create Space action.
- [ ] Implement the one-Space identity treatment without a collection wrapper.
- [ ] Implement multi-Space rows and faint dividers without cards.
- [ ] Map each lifecycle/status to exact copy, color, and motion.
- [ ] Make the row a semantic owner-route link with one accessible label.
- [ ] Place secondary actions outside the primary link and expose them on focus as well as hover.
- [ ] Implement the restrained row hover/focus trace and arrow/name translations.
- [ ] Place `+ Create another Space` beneath the list.

### Task 12: Build attention and empty health states

**Files:**

- Create: `ui/src/yullo/screens/home/components/AttentionSection.tsx`
- Create: `ui/src/yullo/screens/home/lib/homeActions.ts`

**Interfaces:**

- Consumes: `HomeAttentionItem[]`.
- Produces: typed navigation/mutation intent without arbitrary URLs.

- [ ] Render list-like issues with title, bounded detail, and one text action.
- [ ] Map each backend action kind to a known Yullo owner route/action.
- [ ] Return no red warning box for ordinary review work.
- [ ] Render the two-line “Everything looks good / Aura is up to date” empty state.
- [ ] Animate resolution with fade/collapse and crossfade to empty state.
- [ ] Announce meaningful item removal through a polite live region without celebratory animation.

### Task 13: Build recent activity

**Files:**

- Create: `ui/src/yullo/screens/home/components/ActivitySection.tsx`
- Create: `ui/src/yullo/screens/home/lib/formatHomeTime.ts`

**Interfaces:**

- Consumes: redacted `HomeActivityItem[]` and `generatedAt`.

- [ ] Render the quiet dot-and-line timeline.
- [ ] Format relative time with `Intl.RelativeTimeFormat` and an absolute accessible date.
- [ ] Use the new marker only for server-marked recent items.
- [ ] Animate newly inserted IDs with opacity/y over 200ms; do not replay all rows on refetch.
- [ ] Show a restrained empty sentence when no activity exists.
- [ ] Do not expose visitor content or convert activity into metric tiles.

### Task 14: Build one contextual suggestion

**Files:**

- Create: `ui/src/yullo/screens/home/components/SuggestionSection.tsx`

**Interfaces:**

- Consumes: `HomeSuggestion | null`.

- [ ] Omit the section when suggestion is null.
- [ ] Render one reason and one text action.
- [ ] Map the typed suggestion kind to a known Yullo route.
- [ ] Avoid progress bars, scores, carousels, generic encouragement, and request-time AI copy.

### Task 15: Add the sparse network and motion choreography

**Files:**

- Modify: `ui/src/yullo/theme/motion.ts`
- Modify: `ui/src/yullo/screens/home/YulloHomePage.tsx`
- Modify: `ui/src/yullo/screens/home/components/NetworkSignal.tsx`

**Interfaces:**

- Produces: centralized Yullo Home variants and one-shot signature motion.

- [ ] Implement the fixed easing and 50/110/170ms entrance offsets.
- [ ] Build the account-to-Space signature line as an absolute, pointer-free, aria-hidden SVG or CSS layer.
- [ ] Run the signature connection once per mount for 500–700ms, then leave the page still.
- [ ] Restrict network motifs to Space hover, Aura status, and the one-shot signature/context switch.
- [ ] Disable travel, breathing scale, transforms, and reconnect motion under reduced motion.
- [ ] Ensure animation never delays interaction or shifts layout.

### Task 16: Add loading, error, refresh, and resilient state handling

**Files:**

- Create: `ui/src/yullo/screens/home/components/HomeSkeleton.tsx`
- Create: `ui/src/yullo/screens/home/components/HomeError.tsx`
- Modify: `ui/src/yullo/screens/home/hooks/useYulloHome.ts`

**Interfaces:**

- Produces: non-disruptive async page states.

- [ ] Match skeletons to editorial text lines, rows, and dividers.
- [ ] Avoid shimmer and large card placeholders.
- [ ] Keep cached data visible during background refresh.
- [ ] Distinguish unauthorized from retryable failure.
- [ ] On unauthorized, clear Yullo-only state and route to Yullo auth.
- [ ] On retryable failure, show human copy and a text retry action.
- [ ] Prevent duplicate toasts or animation replays on background refetch.

### Task 17: Complete responsive and accessibility behavior

**Files:**

- Modify: all Home components from Tasks 10–16.
- Modify: `ui/src/yullo/theme/tokens.css`

**Interfaces:**

- Produces: usable Home from 320px mobile through wide desktop.

- [ ] Verify no horizontal scroll at 320px.
- [ ] Preserve hierarchy on mobile rather than stacking desktop cards.
- [ ] Add bottom safe-area/future-navigation space.
- [ ] Use `header`, `main`, `section`, headings, lists, time elements, links, and buttons correctly.
- [ ] Keep focus visible in all themes and never depend on color alone for status.
- [ ] Provide tooltip text and accessible names for icon-only controls.
- [ ] Keep interactive targets at least 44×44px.
- [ ] Verify contrast for muted text, yellow controls, dividers, focus rings, and attention states in all themes.
- [ ] Verify keyboard use of Space rows, theme popover, account menu, retry, and all text actions.
- [ ] Verify reduced motion at both OS setting and component level.

### Task 18: Replace the authenticated placeholder and preserve route isolation

**Files:**

- Modify: `ui/src/App.tsx`
- Delete after cutover: `ui/src/yullo/screens/YulloDashboard.tsx`
- Keep unchanged: `ui/src/yullo/screens/YulloHome.tsx`
- Create if needed: `ui/src/yullo/screens/space/YulloSpaceRouteBoundary.tsx`

**Interfaces:**

- Produces: `/yullo/home` → new authenticated Home.

- [ ] Lazy-load `YulloHomePage` and protect it with `YulloPrivateRoute`.
- [ ] Add the owner Space route boundary at `/yullo/home/spaces/:spaceId`.
- [ ] Confirm `/yullo` remains the public marketing page.
- [ ] Confirm localhost `/yullo/:handle` continues to open the public Yullo Space.
- [ ] Confirm root slug resolution and `/support247/:slug` remain unchanged.
- [ ] Remove all testing-only placeholder copy and the shared-store logout call.

### Task 19: Security and product-isolation acceptance

**Files:**

- Review: Yullo auth/session backend and all `ui/src/yullo` imports.

- [ ] Verify a user cannot retrieve another user's Home by changing any path, query, body, header, or stored Space ID.
- [ ] Verify a Support247 Space owned by the same account never appears in Yullo Home.
- [ ] Verify expired and revoked sessions fail immediately.
- [ ] Verify logout invalidates the server session, not only the browser cookie.
- [ ] Verify all owner mutations reject missing/incorrect CSRF and disallowed Origin.
- [ ] Verify cookies are HttpOnly, Secure in production, SameSite=Lax, Path=/, and host-only.
- [ ] Verify Google authentication rejects forged claims, wrong audience/issuer, expired token, and replayed/invalid nonce where the flow uses one.
- [ ] Verify OTP values never appear in production responses or logs.
- [ ] Verify Home/auth responses are `no-store` and contain no secrets, visitor content, internal reasoning, or raw source data.
- [ ] Verify no Home content uses raw HTML or unvalidated external navigation.
- [ ] Run an import-boundary check that fails if Yullo imports Support247 components, hooks, stores, API clients, themes, layouts, features, or render engine modules.
- [ ] Verify public Yullo and Support247 routes cannot access authenticated Home data from frontend caches after logout/account switch.

### Task 20: Final integration and visual acceptance

**Files:**

- Review: all files in this plan.
- Update: `yullo/auraplans/missing_ui.md` to mark Home implemented and keep Space/Aura management separate.

**Acceptance scenarios:**

- [ ] Zero Spaces shows one calm onboarding action.
- [ ] One Space uses the dedicated identity layout without an awkward collection.
- [ ] Multiple Spaces form an editorial list with correct owner routing.
- [ ] Draft, learning, updating, live, needs-review, and unavailable states render honestly.
- [ ] No cross-user, cross-Space, or Support247 data appears.
- [ ] Attention items have grounded causes and typed actions.
- [ ] Empty attention is calm and compact.
- [ ] Recent activity contains safe human sentences and correct time formatting.
- [ ] At most one deterministic suggestion appears.
- [ ] Light, Warm, Dark, and System work without reload or public-preview leakage.
- [ ] Signature motion runs once; ambient motion is sparse; reduced motion is honored.
- [ ] Loading and errors preserve the editorial layout.
- [ ] Keyboard, screen-reader, touch, mobile, tablet, and desktop behavior are usable.
- [ ] No KPI grid, chart, sidebar, glass panel, nested card, permanent animated network, sparkle icon, or profile-completion score has been introduced.
- [ ] Support247 build and primary routes remain unchanged.

Run the existing backend checks affected by the new endpoint/migration, the frontend type-check/build, and focused behavioral checks for auth isolation, theme scope, response parsing, Space-count variants, and reduced motion. Do not add snapshots that merely freeze markup.

---

## 8. Release order

1. Complete Aura/runtime identity and Yullo Space ownership prerequisites.
2. Ship revocable Yullo sessions and complete identity-provider verification.
3. Ship preference migration and backend Home/session endpoints behind a Yullo Home flag.
4. Ship the fully isolated frontend API, primitives, auth guard, theme system, and page components.
5. Enable internally with representative zero/one/multiple-Space accounts.
6. Verify auth attacks, tenant isolation, all themes, viewport classes, and reduced motion.
7. Enable `/yullo/home` for Yullo users.
8. Remove the placeholder only after the new route is stable.

Rollback disables the new authenticated Home route/flag and restores a minimal Yullo-only unavailable page. It must not redirect users to Support247, delete preferences, mutate Aura data, or affect public Yullo links.

## 9. Definition of done

- `/yullo/home` feels like a living personal Yullo presence rather than a dashboard.
- The page presents only grounded, server-scoped data for the authenticated user's Yullo Spaces.
- One and multiple Space ownership both feel intentional.
- Attention outranks analytics; recent activity reads as human events; suggested work is singular and contextual.
- Theme, state, API, routes, and components are isolated under Yullo.
- No Support247 frontend code is reused by the Yullo Home bundle.
- Authentication uses revocable server sessions, secure cookies, CSRF protection, verified identity-provider claims, and no browser-persisted bearer token.
- Public Space appearance and Support247 remain unchanged.
- Motion is subtle, finite, and accessible.
- The implementation contains no placeholder business data or invented activity.
