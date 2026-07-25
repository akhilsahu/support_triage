# Chatbot Customer Login (Sign in with Google) — Implementation Plan

Per-chatbot optional requirement that end customers sign in with Google before
chatting, so their message history is preserved and resumable. This is **end-customer
auth**, entirely separate from the space-owner (dashboard) auth.

## Locked decisions

| Decision | Choice |
|---|---|
| Where it runs | **Hosted page only** (`/{slug}`, `/{slug}/{chatbotSlug}`). Not the embedded iframe (v1). |
| Identity scope | **Global / platform-wide.** One Google login works on every space's chatbot. |
| Gate style | **Soft gate** — welcome is visible; login is required before the first message **or after N free messages** (admin-configurable per bot). |
| History | Chats optionally belong to a user. Logged-in users get a **history drawer** listing their conversations: **current space on top, then all other spaces below.** Existing `?chat=` continuity is preserved. |
| Provider | **Google** in v1, but the schema is provider-extensible by design (phone, plain email, Facebook later) via a separate identities table. |
| Privacy | Signed off: all chat data belongs to the same logged-in user; the drawer doubles as the user's own view of **which spaces they've accessed**. Deletion path still planned (Phase E). |

## Why "hosted page only" matters
It removes the single hardest problem: Google sign-in inside a third-party
iframe is broken by third-party-cookie deprecation (needs FedCM/popup). On the
first-party hosted page, the standard Google Identity Services (GIS) button /
popup works directly. Embedded-widget login is deferred to a later phase.

---

## 1. Data model

### 1.1 New tables: `chatbot_user` + `chatbot_user_identity` (global, platform-level)

Two tables, so future auth methods (phone OTP, plain email+password, Facebook)
are new **identity rows**, not schema changes — and two methods can link to one
person (account linking).

`chatbot_user` — the person/profile (provider-agnostic):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | varchar(320) | nullable (phone-only users won't have one) |
| `phone` | varchar(20) | nullable — reserved for future phone auth |
| `name` | varchar(200) | nullable |
| `avatar_url` | text | nullable |
| `created_at` | timestamp | |
| `last_seen_at` | timestamp | bumped on each auth |

`chatbot_user_identity` — one row per login method:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → chatbot_user ON DELETE CASCADE | |
| `provider` | varchar(20) | `'google'` (later: `'phone'`, `'email'`, `'facebook'`) |
| `provider_sub` | varchar(255) | Google `sub`; E.164 number for phone; email for email-auth |
| `created_at` | timestamp | |

- `UNIQUE (provider, provider_sub)` — the identity key.
- Index on `chatbot_user.email` (support/debugging).
- Provider-specific secrets (password hash, OTP state) are **not** in these tables —
  they'd live in a per-provider table when that provider lands. Core stays lean.
- **Not** space-scoped — this is the platform-wide customer record.
- Auth flow: verify → find identity by `(provider, provider_sub)` → its user; if no
  identity, optionally match an existing user by verified email (link) else create both.

### 1.2 `chat_sessions.chatbot_user_id` (new column)
- `UUID NULL REFERENCES chatbot_user(id) ON DELETE SET NULL`, indexed.
- NULL = anonymous session (today's behavior, still supported).
- Set when a logged-in customer sends, and on "claim" (below).

### 1.3 `chatbots.login_after_messages` (new column)
One nullable integer instead of a boolean, covering both modes:

- `NULL` → login never required (default; today's behavior).
- `0`   → login required before the **first** message.
- `N>0` → the customer may send **N** free messages, then must log in to continue.

Dashboard UI (Chatbot UI page): a "Require customer login (Google)" checkbox; when
checked, an optional number input "after ☐ free messages" (empty = immediately).

- Add to `Chatbot.to_dict()`, `ChatbotUpdate` schema, and the public `/public/{slug}`
  response (frontend needs the threshold to show the gate at the right moment).
- Known soft spot: the free-message counter is **per session**, so an anonymous
  visitor can reset it by starting a new session. Acceptable for v1 (it's a
  nudge-to-login, not a paywall); a device-cookie counter can harden it later.

### 1.4 Migration `0032_chatbot_user_login`
Idempotent (mirrors 0029–0031): create `chatbot_user` + `chatbot_user_identity`,
add `chat_sessions.chatbot_user_id` and `chatbots.login_after_messages`.

---

## 2. Configuration / ops prerequisites

- **`GOOGLE_CLIENT_ID`** (+ client secret only if we use the code flow; the ID-token
  flow needs just the client id) in `app/config.py` / env. **None exists today.**
- Authorized JavaScript origins in the Google Cloud console must include the hosted
  origins (localhost:3000 for dev, prod domain).
- **Expose the client id to the widget** via the existing public settings endpoint
  the widget already fetches (`/api/v1/super-admin/settings/public`): add
  `google_client_id`. Frontend reads it there — no new fetch.
- Python dep: **`google-auth`** (`google.oauth2.id_token.verify_oauth2_token`).

---

## 3. Backend

### 3.1 Google ID-token verification
`app/auth/chatbot_user.py` (new):
- `verify_google_id_token(token) -> {sub, email, name, picture, email_verified}`
  using `google.oauth2.id_token.verify_oauth2_token(token, Request(), GOOGLE_CLIENT_ID)`.
  Reject if `email_verified` is false or `aud` mismatches.

### 3.2 Customer JWT (our own)
- Reuse the JWT lib used by owner auth, **separate claims**: `sub = chatbot_user.id`,
  `typ = 'customer'`. TTL long-ish (e.g. **30 days**) so history persists; refresh on
  each auth call. Signed with the existing secret (or a dedicated one).
- `current_customer` FastAPI dependency (parses `Authorization: Bearer` → `chatbot_user`);
  an **optional** variant (returns `None` when absent, for the soft path) and a
  **required** variant (401 when absent).

### 3.3 Endpoints
- `POST /api/chat/{slug}/auth/google`
  body `{ id_token, session_id? }`:
  1. verify token → Google identity;
  2. find `chatbot_user_identity` by `(google, sub)` → user; else link-by-verified-email
     or create user + identity; bump `last_seen_at`;
  3. **claim**: if `session_id` given, that `ChatSession` is anonymous
     (`chatbot_user_id IS NULL`) and in this space → set `chatbot_user_id`;
  4. return `{ token, user: { email, name, avatar_url } }`.
- `GET /api/chat/me/sessions?current={slug}` (requires customer):
  the customer's sessions **across all spaces**, each annotated with
  `{ id, title, space_slug, space_name, chatbot_slug, last_message_at, status }`,
  ordered **current space first (by last_message desc), then all other spaces**.
- (Optional) `POST /api/chat/logout` — client clears token; server no-op unless we
  add a revocation list.

### 3.4 Enforcement + session stamping (existing endpoints)
- **Send** (`POST /api/chat/{slug}`): parse optional customer token.
  - Gate rule: `login_after_messages` is not NULL, no customer token, and the
    session's **user-message count ≥ threshold** → **401** with a machine-readable
    code (`login_required`) the frontend turns into the Google gate. (Threshold 0
    → blocked from the first message.)
  - On session upsert (`customer.py` ~line 326/346): set `chatbot_user_id = customer.id`
    when present; if the session existed anonymous and a customer is present, **claim** it.
- **History restore** (`GET /api/chat/{slug}/session/{id}`): a session **owned by a
  user** requires that user's token. Anonymous sessions stay accessible by URL id
  (pre-existing `?chat=` deep links keep working) until claimed.
- **Suggestions / public info**: unchanged; `public/{slug}` gains `login_after_messages`.

---

## 4. Frontend

### 4.1 Chatbot UI page (dashboard)
- Add **"Require customer login (Google)"** checkbox + optional **"after ☐ free
  messages"** number input → `PATCH /chatbots/{slug}` `{ login_after_messages }`
  (unchecked → null). Lives with the other per-bot UI settings.

### 4.2 CustomerChat — soft gate
- Read `login_after_messages` + `google_client_id` (public info + public settings).
- Customer auth state in `localStorage` (`support247-customer` → `{ token, user }`).
- Gate moment: when not signed in and the session's sent-message count has reached
  the threshold (0 → before the first message), the **input row is replaced by a
  "Continue with Google" button** + a one-line consent notice; with N>0 free
  messages left, a subtle "N free messages left — sign in to keep your history"
  hint shows instead. Also handle the server's 401 `login_required` (authoritative).
  Load the GIS script; on credential → `POST auth/google` (pass the current `?chat=`
  session_id to claim it) → store token → unlock input.
- Header shows the customer **avatar + name + Logout** when signed in.
- Attach the customer token to send/history requests.

### 4.3 History drawer
- A drawer/sidebar (hamburger in the chat header) → `GET /api/chat/me/sessions?current={slug}`.
- Render **current space's conversations on top**, then a divider, then **other spaces**
  grouped by space (name + logo). Click a row → resume:
  - same space → set `?chat=<id>`;
  - other space → navigate to that space's hosted URL with `?chat=<id>` (token carries over).

---

## 5. Security & privacy

- **Global identity — signed off.** All chat data belongs to the same logged-in user,
  and the history drawer doubles as the user's own transparent view of every space
  they've accessed. Still shipping (Phase E): a consent line at login and a deletion
  path (erase `chatbot_user`, identities + their sessions) for DPDP hygiene.
- Verify `email_verified`; reject unverified.
- **Rate-limit** `auth/google` and `me/sessions`.
- Customer JWT over HTTPS only; short-enough TTL + refresh-on-auth.
- The `/me/sessions` response reveals other-space brand names to the customer — that's the
  customer's *own* data, so acceptable, but it is by design cross-brand.
- Google **consent screen shows "SUPPORT247"**, not the brand (single platform app). ⚠️ Confirm acceptable.

---

## 6. Phasing

- **A — Backend core:** migration (both tables + columns); `google-auth`; config + expose
  `google_client_id`; verify + `auth/google` (identity lookup / link / create);
  `current_customer` dep; `login_after_messages` in model/schema/public info.
- **B — Enforcement & sessions:** send gate (threshold count → 401 `login_required`);
  history access control; stamp + claim; `me/sessions`.
- **C — Frontend gate:** checkbox + free-messages input on Chatbot UI page; soft gate +
  Google button + "N free messages left" hint + token storage; header avatar/logout.
- **D — History drawer:** drawer UI, current-space-first ordering, cross-space resume.
- **E — Privacy polish:** consent notice, deletion endpoint, rate-limits.

## 7. Test plan
- **Backend:** token verify (mocked); identity upsert + link-by-email idempotency;
  threshold gate (null / 0 / N: message N sends, N+1 → 401) with and without token;
  claim logic; `me/sessions` ordering (current space first); owned-session access control.
- **Frontend:** gate appears at the right message count; free-messages hint; login
  unlocks + claims the current chat; drawer lists and resumes (same-space and
  cross-space); logout clears state.

## 8. Resolved decisions (were open items)
1. Privacy posture — **signed off** (all data belongs to the same user; drawer shows
   the user their own accessed spaces). Deletion path still ships in Phase E.
2. Anonymous `?chat=` deep links — **stay accessible** until a session is claimed;
   owned sessions require their owner's token.
3. Customer JWT — **30 days, refreshed on each login** (default; can tighten later).
4. Consent screen shows "SUPPORT247" (platform Google app) — accepted default.
5. Provider extensibility — **identities table** (§1.1) so phone/email/Facebook are
   additive rows, with account linking supported.
6. Free-message threshold — `login_after_messages` (§1.3): null/0/N.
