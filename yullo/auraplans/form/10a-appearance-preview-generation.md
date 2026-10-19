# Yullo Appearance Preview Generation Implementation Plan

> **For agentic workers:** Implement this plan task-by-task and track completion with the checkboxes. Do not commit or push unless the user explicitly authorizes it.

**Goal:** Make the existing Appearance Studio open with a complete, responsive landing preview immediately, then automatically replace example content with grounded Space-specific preview content without presenting Aura as a chatbot.

**Architecture:** The editor renders deterministic frontend fixtures synchronously so it never opens blank. On first access during a browser session, an authenticated preview endpoint loads publishable, confirmed data for the selected Space and uses the configured LLM provider to organize that data into a strict preview-only contract. The generated result lives only in editor state/session cache, can be rebuilt explicitly, and is never stored as knowledge, entities, or public landing content.

**Tech Stack:** React 18, TypeScript, TanStack Query, Zod, Motion for React, FastAPI, Pydantic, SQLAlchemy, configured OpenAI-compatible providers through `get_async_openai_clients`.

**Spec:** Companion to `yullo/auraplans/form/10-appearance-form.md`.

## Global constraints

- Keep backend work under `app/yullo/` and frontend work under `ui/src/yullo/`.
- Extend the existing Appearance page, draft history and real public renderer. Do not create a second landing renderer.
- The editor displays deterministic fixtures immediately. LLM latency must never block opening the editor.
- Automatically generate once per Space per browser session after the Appearance response is ready. Do not require an initial button click.
- Provide **Rebuild preview** after the first automatic attempt.
- Preview content is editor-only and ephemeral. Do not write it to `yullo_space_entities`, `kb_facts`, knowledge documents, `appearance_config`, conversation tables, or the public API.
- Never expose example fixtures or editor-generated preview content on the public Yullo Link.
- The LLM may organize, shorten and label supplied facts. It must not invent services, portfolio work, products, locations, events, prices, statistics, testimonials, URLs or capabilities.
- Only active, reviewed, publishable same-Space entities may enter the preview-generation prompt.
- Use `get_async_openai_clients`; do not instantiate a provider client directly.
- Provider/model/timeout/context/item limits must come from validated Appearance runtime configuration.
- Return strict JSON validated by Pydantic and Zod. Reject unknown properties.
- No chat bubbles, Aura avatar, typing dots, shimmer, bounce, perpetual pulse, glow, or conversational transcript.
- Use semantic Yullo tokens, `motion/react`, easing `[0.22, 1, 0.36, 1]`, and respect `prefers-reduced-motion`.
- Preserve all unrelated work in the repository.

---

## User experience

### First access

```text
Appearance response loads
        ↓
Deterministic purpose-specific fixtures render immediately
        ↓
Small status: “Preparing a preview from this Space…”
        ↓
Authenticated grounded generation runs in the background
        ↓
Validated sections replace matching fixtures with restrained motion
        ↓
Status: “Preview built from 4 confirmed details”   Rebuild preview
```

The owner can use theme, emphasis, accent, background, section order, density, device and network controls throughout generation. A generation result updates content only; it must not overwrite the current appearance draft.

### Later access during the same browser session

Load the validated cached preview immediately from `sessionStorage`. Do not call the LLM again unless the owner chooses **Rebuild preview**.

### Failure or insufficient context

- Keep fixtures visible and usable.
- Show one quiet line: `Using example content — add confirmed Space details for a tailored preview.`
- Do not display provider errors, stack traces or retry loops.
- **Rebuild preview** remains available.

### Rebuild

Rebuild bypasses the session cache, calls the same endpoint, and replaces only the preview content after successful validation. A failed rebuild leaves the current preview unchanged.

---

## Canonical preview-only contract

Backend Pydantic and frontend Zod definitions must match exactly.

```ts
type PreviewSectionType =
  | 'services'
  | 'portfolio'
  | 'products'
  | 'location'
  | 'featured'
  | 'prompt_starters'

type PreviewContentSource = 'example' | 'grounded'

interface AppearancePreviewItem {
  key: string
  title: string
  description?: string | null
  meta?: string | null
  source: PreviewContentSource
  sourceEntityId?: string | null
}

interface AppearancePreviewSection {
  type: PreviewSectionType
  eyebrow?: string | null
  heading: string
  items: AppearancePreviewItem[]
}

interface AppearancePreviewContent {
  schemaVersion: 1
  sections: AppearancePreviewSection[]
}

interface AppearancePreviewRequest {
  currentConfig: SpacePresentationConfigV1
  force: boolean
}

interface AppearancePreviewResponse {
  status: 'ready' | 'insufficient_context' | 'unavailable'
  content: AppearancePreviewContent | null
  explanation: string
  groundedEntityIds: string[]
  inputFingerprint: string
}
```

Validation limits:

- At most one section of each type.
- At most four items per section.
- `title`: 1–120 characters.
- `description`: at most 240 characters.
- `meta`: at most 100 characters.
- `eyebrow`: at most 60 characters.
- `heading`: 1–100 characters.
- Grounded items require a supplied same-Space entity ID.
- The backend assigns stable `key` values after validation; do not trust model-generated keys.
- The endpoint never returns `source: example`; examples are frontend-owned fixtures only.

---

## Grounding and generation rules

### Eligible input

Reuse the owner and product boundary already used by `_appearance_context`. Load:

- Space display name, purpose, category, About and logo presence.
- `YulloSpaceEntity` rows matching the selected Space.
- `is_active = true`.
- `is_public = true`.
- `review_status IN ('owner_confirmed', 'source_authoritative')`.
- `visibility IN ('public', 'public_aura')`, with the existing reviewed legacy-null compatibility rule only if already approved elsewhere.
- Entity types `offering`, `portfolio_item`, `location`, `event`, and `action`.

Do not send complete rows, evidence blobs, private fields or unrelated configuration to the model. Project each entity into an allowlisted prompt DTO:

```python
{
    "id": str(entity.id),
    "type": entity.entity_type,
    "title": approved_title,
    "description": approved_description,
    "meta": approved_short_metadata,
}
```

Apply field visibility before building this DTO. If the policy layer cannot prove a field is public-preview eligible, omit it.

### Deterministic behavior before the LLM

If no eligible entity exists, return `insufficient_context` without calling a provider. Identity remains real and the frontend retains fixtures for design purposes.

Build `inputFingerprint` from normalized Space identity, projected entity IDs/revisions and prompt version. Never include timestamps or appearance choices that do not affect content; changing an accent must not trigger regeneration.

### Model prompt

Use this task-specific system prompt:

```text
You organize supplied Yullo Space information into preview-only landing sections.
Return one JSON object matching the supplied schema.
Use only the supplied entities and preserve each used entity ID.
You may shorten or clarify supplied wording without changing its meaning.
Do not invent services, products, portfolio work, locations, events, prices,
statistics, testimonials, links, contact details, claims or capabilities.
Omit a section when no supplied entity supports it.
Use at most four items per section and concise public-facing language.
Return data only. Never output HTML, CSS, JSX, Markdown or design instructions.
```

Use temperature `0.1`, JSON response format, configured timeout and zero SDK retries. Iterate configured providers in priority order. Validate the returned entity IDs against the projected input before returning a response.

### Mapping

```text
offering(kind=service or unspecified) → services
offering(kind=product)                → products
portfolio_item                        → portfolio
location                              → location
event or explicitly featured item    → featured
```

Prompt starters are deterministic frontend labels derived only from generated section availability:

```text
services  → “What do you offer?”
portfolio → “Show me your work”
location  → “Where are you located?”
featured  → “What’s happening next?”
```

Do not use an LLM to generate questions that imply unsupported capabilities.

---

## File structure

### Create

```text
app/yullo/schemas/appearance_preview.py
  Strict Pydantic request, response, section and item contracts.

app/yullo/services/appearance/preview.py
  Owner-scoped context projection, fingerprinting, provider call,
  post-validation and generation orchestration.

ui/src/yullo/screens/appearance/preview/types.ts
  Zod schemas and inferred TypeScript types matching the backend.

ui/src/yullo/screens/appearance/preview/fixtures.ts
  Purpose-specific deterministic example sections.

ui/src/yullo/screens/appearance/preview/mergePreviewContent.ts
  Pure merge: grounded section replaces the corresponding fixture section.

ui/src/yullo/screens/appearance/preview/useAppearancePreview.ts
  Automatic first-load generation, session cache, rebuild and failure state.

ui/src/yullo/screens/appearance/preview/PreviewDirection.tsx
  Non-chat generation status and Rebuild control.

ui/src/yullo/screens/appearance/preview/PreviewSection.tsx
  Editorial preview-only rendering and source-safe motion wrapper.
```

### Modify

```text
app/yullo/api/appearance.py
  Add POST /{space_id}/appearance/preview.

app/yullo/config/appearance.py
  Add validated preview-generation configuration.

app/yullo/services/appearance_assistant.py
  Reuse a shared owner context helper only if extraction avoids changing
  the existing recommendation/command behavior.

ui/src/yullo/api/appearance.ts
  Add generatePreview(spaceId, request, signal).

ui/src/yullo/screens/appearance/AppearanceScreen.tsx
  Own the preview hook and pass preview content/status to canvas and inspector.

ui/src/yullo/screens/appearance/components/AppearanceCanvas.tsx
ui/src/yullo/screens/appearance/components/PublicLinkPreview.tsx
ui/src/yullo/screens/appearance/components/inspector/AppearanceInspector.tsx
  Thread preview content and place PreviewDirection above Theme.

ui/src/yullo/screens/public/PublicSpaceExperience.tsx
ui/src/yullo/screens/public/components/AuraExperience.tsx
ui/src/yullo/screens/public/components/AuraIntro.tsx
  Accept optional editor preview content. Render no example sections when absent.

ui/src/yullo/screens/appearance/appearance.css
  Add editorial status, section-transition and responsive styles.
```

Do not convert `app/yullo/schemas/appearance.py` into an `appearance/` package merely to obtain a nested filename. That migration has no product value and risks import churn. The API path is `/appearance/preview`; the Python file remains `appearance_preview.py`.

---

## Task 1: Define matching strict contracts

**Files:**

- Create: `app/yullo/schemas/appearance_preview.py`
- Create: `ui/src/yullo/screens/appearance/preview/types.ts`
- Test: `tests/unit/schemas/test_yullo_appearance_preview.py`
- Test: `ui/src/yullo/screens/appearance/preview/types.test.ts`

**Produces:** `AppearancePreviewRequest`, `AppearancePreviewResponse`, `AppearancePreviewContent`, `AppearancePreviewSection`, `AppearancePreviewItem` and their Zod equivalents.

- [ ] Add backend enum and strict Pydantic contracts with the exact aliases and limits defined above.
- [ ] Add matching strict Zod contracts and infer exported TypeScript types.
- [ ] Verify unknown fields, duplicate section types, oversized items and grounded items without `sourceEntityId` are rejected.
- [ ] Run:

```bash
.venv/bin/pytest -q tests/unit/schemas/test_yullo_appearance_preview.py
cd ui && npm test -- --run src/yullo/screens/appearance/preview/types.test.ts
```

- [ ] Stop for review. Commit only if the user explicitly authorizes it.

---

## Task 2: Build deny-by-default grounded context

**Files:**

- Create: `app/yullo/services/appearance_preview.py`
- Modify only if useful: `app/yullo/services/appearance_assistant.py`
- Test: `tests/unit/yullo/test_appearance_preview.py`

**Produces:**

```python
async def collect_preview_context(
    db: AsyncSession, *, user_id: UUID, space_id: UUID
) -> PreviewGenerationContext

def build_preview_fingerprint(context: PreviewGenerationContext) -> str
```

- [ ] Enforce authenticated owner, `Space.product == 'yullo'`, and exact Space ID before reading entities.
- [ ] Project only eligible entity types and approved public-preview fields.
- [ ] Sort projected entities by `sort_order`, then ID for deterministic prompts.
- [ ] Include entity revision in the fingerprint so confirmed content edits invalidate prior results.
- [ ] Verify private, inactive, extracted, rejected and cross-Space rows never enter context.
- [ ] Verify fingerprint stability for identical normalized input.
- [ ] Run:

```bash
.venv/bin/pytest -q tests/unit/yullo/test_appearance_preview.py
```

- [ ] Stop for review. Commit only if explicitly authorized.

---

## Task 3: Add configurable preview generation

**Files:**

- Modify: `app/yullo/config/appearance.py`
- Modify: `app/yullo/services/appearance_preview.py`
- Test: `tests/unit/yullo/test_appearance_preview.py`

**Configuration:**

```python
preview_generation_enabled: bool = True
preview_model: str = "gpt-4o-mini"
preview_timeout_seconds: float = 15.0
preview_max_context_characters: int = 6000
preview_max_items_per_section: int = 4
preview_prompt_version: str = "v1"
```

Environment names:

```text
YULLO_APPEARANCE_PREVIEW_ENABLED
YULLO_APPEARANCE_PREVIEW_MODEL
YULLO_APPEARANCE_PREVIEW_TIMEOUT_SECONDS
YULLO_APPEARANCE_PREVIEW_MAX_CONTEXT_CHARACTERS
YULLO_APPEARANCE_PREVIEW_MAX_ITEMS_PER_SECTION
YULLO_APPEARANCE_PREVIEW_PROMPT_VERSION
```

**Produces:**

```python
async def generate_appearance_preview(
    db: AsyncSession,
    *,
    user_id: UUID,
    space_id: UUID,
    request: AppearancePreviewRequest,
) -> AppearancePreviewResponse
```

- [ ] Return `insufficient_context` before provider initialization when no eligible entity exists.
- [ ] Use `get_async_openai_clients` with configured model, timeout and zero retries.
- [ ] Apply the exact prompt and structured JSON validation.
- [ ] Recheck every returned `sourceEntityId` against the eligible prompt map.
- [ ] Assign deterministic keys as `{section_type}:{entity_id}` after model validation.
- [ ] On provider exhaustion return `unavailable`; do not raise raw provider errors to the UI.
- [ ] Log Space ID, provider, model, status, latency and counts; never log prompt content or entity payloads.
- [ ] Verify an invented ID causes rejection and an unavailable provider preserves a typed response.
- [ ] Run:

```bash
.venv/bin/pytest -q tests/unit/yullo/test_appearance_preview.py
.venv/bin/python -m ruff check app/yullo/config/appearance.py app/yullo/services/appearance_preview.py app/yullo/schemas/appearance_preview.py
```

- [ ] Stop for review. Commit only if explicitly authorized.

---

## Task 4: Expose the authenticated endpoint

**Files:**

- Modify: `app/yullo/api/appearance.py`
- Test: `tests/api/test_yullo_appearance_preview.py`

**Endpoint:**

```text
POST /api/v1/yullo/spaces/{space_id}/appearance/preview
```

Request:

```json
{
  "currentConfig": {
    "schemaVersion": 1,
    "themePreset": "clean",
    "landingEmphasis": "services",
    "accent": "yullo",
    "backgroundTreatment": "soft",
    "hero": {"layout": "centered"},
    "sections": [{"type": "identity", "visible": true}],
    "visualDensity": "balanced",
    "networkIntensity": "very_low",
    "presentationSource": "owner"
  },
  "force": false
}
```

- [ ] Add a thin authenticated route using `current_user` and the existing DB dependency.
- [ ] Do not commit the database transaction; the service is read-only.
- [ ] Return the strict response model with aliases.
- [ ] Verify unauthenticated, wrong-owner, Support247 and cross-Space calls fail without invoking a provider.
- [ ] Run:

```bash
.venv/bin/pytest -q tests/api/test_yullo_appearance_preview.py
```

- [ ] Stop for review. Commit only if explicitly authorized.

---

## Task 5: Add deterministic fixtures and merge behavior

**Files:**

- Create: `ui/src/yullo/screens/appearance/preview/fixtures.ts`
- Create: `ui/src/yullo/screens/appearance/preview/mergePreviewContent.ts`
- Test: `ui/src/yullo/screens/appearance/preview/fixtures.test.ts`

**Produces:**

```ts
function createAppearancePreviewFixtures(
  purpose: SpacePurpose,
  identity: AppearanceSpaceSummary,
): AppearancePreviewContent

function mergeAppearancePreview(
  fixture: AppearancePreviewContent,
  grounded: AppearancePreviewContent | null,
): AppearancePreviewContent
```

- [ ] Provide restrained example content for business, creator, person and organization purposes.
- [ ] Label every fixture item `source: 'example'`; never attach entity IDs.
- [ ] Use the real Space name only in identity-safe headings. Do not synthesize claims about the Space.
- [ ] Replace a fixture section only when a validated grounded section of the same type contains items.
- [ ] Preserve the current `config.sections` order at render time rather than embedding order in fixtures.
- [ ] Verify fixtures are deterministic and a grounded section replaces only its matching example section.
- [ ] Run:

```bash
cd ui && npm test -- --run src/yullo/screens/appearance/preview/fixtures.test.ts
```

- [ ] Stop for review. Commit only if explicitly authorized.

---

## Task 6: Implement automatic generation and session caching

**Files:**

- Modify: `ui/src/yullo/api/appearance.ts`
- Create: `ui/src/yullo/screens/appearance/preview/useAppearancePreview.ts`
- Test: `ui/src/yullo/screens/appearance/preview/useAppearancePreview.test.tsx`

**Produces:**

```ts
interface UseAppearancePreviewResult {
  content: AppearancePreviewContent
  status: 'example' | 'generating' | 'ready' | 'unavailable'
  explanation: string
  groundedCount: number
  rebuild: () => Promise<void>
  isRebuilding: boolean
}
```

- [ ] Add `appearanceApi.generatePreview(spaceId, request, signal)`.
- [ ] Build fixtures synchronously before any network request.
- [ ] Read `sessionStorage` key `yullo:appearance-preview:v1:{spaceId}` and validate it with Zod before use.
- [ ] Automatically call the endpoint once when there is no valid session result.
- [ ] Merge grounded content over fixtures only after complete response validation.
- [ ] Store `{content,inputFingerprint,explanation,groundedEntityIds}` after `status=ready`.
- [ ] `rebuild()` sends `force:true`, retains current content while pending, and replaces cache only on success.
- [ ] Cancel an in-flight request when Space ID changes or the screen unmounts.
- [ ] Never regenerate because accent, background, device or density changes.
- [ ] Verify immediate fixtures, one automatic request, cache reuse, rebuild bypass and failure preservation.
- [ ] Run:

```bash
cd ui && npm test -- --run src/yullo/screens/appearance/preview/useAppearancePreview.test.tsx
```

- [ ] Stop for review. Commit only if explicitly authorized.

---

## Task 7: Integrate the preview without leaking it publicly

**Files:**

- Modify: `ui/src/yullo/screens/appearance/AppearanceScreen.tsx`
- Modify: `ui/src/yullo/screens/appearance/components/AppearanceCanvas.tsx`
- Modify: `ui/src/yullo/screens/appearance/components/PublicLinkPreview.tsx`
- Modify: `ui/src/yullo/screens/public/PublicSpaceExperience.tsx`
- Modify: `ui/src/yullo/screens/public/components/AuraExperience.tsx`
- Modify: `ui/src/yullo/screens/public/components/AuraIntro.tsx`
- Create: `ui/src/yullo/screens/appearance/preview/PreviewSection.tsx`
- Test: `ui/src/yullo/screens/appearance/preview/previewIsolation.test.tsx`

- [ ] Instantiate `useAppearancePreview` only inside `AppearanceScreen`.
- [ ] Thread `previewContent` explicitly through the editor preview component chain.
- [ ] Remove `MockServices`, `MockPortfolio`, `MockProducts`, `MockLocation` and `MockFeatured` from `AuraIntro.tsx`.
- [ ] Render `PreviewSection` only when the optional editor preview prop exists.
- [ ] When `PublicYulloLink` renders without editor preview content, unavailable sections return `null` rather than examples.
- [ ] Preserve real identity, appearance config, hero asset and prompt composer in both contexts.
- [ ] Render sections in `presentation.sections` order and honor `visible` immediately.
- [ ] Verify examples appear in Appearance Studio and never appear in the public page component tree.
- [ ] Run:

```bash
cd ui && npm test -- --run src/yullo/screens/appearance/preview/previewIsolation.test.tsx
```

- [ ] Stop for review. Commit only if explicitly authorized.

---

## Task 8: Add the editorial generation control and motion

**Files:**

- Create: `ui/src/yullo/screens/appearance/preview/PreviewDirection.tsx`
- Modify: `ui/src/yullo/screens/appearance/components/inspector/AppearanceInspector.tsx`
- Modify: `ui/src/yullo/screens/appearance/preview/PreviewSection.tsx`
- Modify: `ui/src/yullo/screens/appearance/appearance.css`

### Placement

Place **Preview direction** as the first inspector band, before Theme. It is a typographic band separated by a thin rule, not a rounded card.

```text
PREVIEW DIRECTION

Preparing a preview from this Space…

or

Built from 4 confirmed details             Rebuild preview
```

Do not add a conversational transcript. Do not reuse `AppearanceAuraDesigner` for this status. The existing Aura designer may continue changing allowlisted appearance configuration later in the inspector.

### Motion implementation

- [x] Wrap visible preview sections in `motion.section` with stable section-type keys and `layout="position"`.
- [x] Initial fixture render is immediate; do not sequence the entire page on load.
- [x] While generating, set only generated-content sections to opacity `.65`; keep controls and identity fully interactive.
- [x] On grounded replacement, animate `opacity: 0→1` and `y: 8→0` over `220ms` with `[0.22,1,0.36,1]`.
- [x] Stagger replaced sections by `70ms`, capped at `280ms` total.
- [x] Draw one 1px accent trace across the section anchor over `320ms`; remove it after completion.
- [x] Apply a low-opacity accent background wash for `650ms`, then return to transparent.
- [x] Section reorder uses Motion layout animation at `280ms` without scale or bounce.
- [x] Rebuild keeps current content visible; use the same replacement animation only after success.
- [x] Under reduced motion, disable translation, staggering and trace animation; replace content instantly.

### Responsive behavior

- Desktop/tablet: status sits at the top of the inspector; preview remains dominant.
- Compact/mobile Customize mode: status is full width and Rebuild has a minimum 44px target.
- Compact/mobile Preview mode: generated sections use the actual mobile public layout, never scaled desktop.
- No horizontal overflow at 360px.

- [x] Verify keyboard focus, disabled rebuild state, `aria-live="polite"` status and visible focus rings.
- [x] Stop for review. Commit only if explicitly authorized.

---

## Task 9: Focused end-to-end verification

- [x] Run backend checks:

```bash
.venv/bin/pytest -q \
  tests/unit/schemas/test_yullo_appearance_preview.py \
  tests/unit/yullo/test_appearance_preview.py \
  tests/api/test_yullo_appearance_preview.py
```

- [x] Run frontend checks:

```bash
cd ui
npm test -- --run src/yullo/screens/appearance/preview
npm run type-check
npm run build
```

- [ ] Verify manually at widths 360, 768, 899, 900, 1024, 1200 and 1440 (blocked by saved localhost browser permission):

```text
Fixtures appear immediately.
Automatic generation runs once without blocking controls.
Generated content replaces matching fixture sections.
Rebuild retains old content until success.
Theme/accent/background/device controls remain live during generation.
Hidden and reordered sections update immediately.
Reduced motion is still understandable.
Public Yullo Link contains no example/editor preview content.
```

- [x] Confirm no database row is created or modified by `/appearance/preview`.
- [x] Confirm logs contain no source text or entity payload.
- [x] Review the final diff for files outside the declared Yullo paths.
- [x] Report verification results and any unverified provider path. Do not commit or push without explicit authorization.

---

## Completion criteria

- Appearance Studio always opens with a useful landing preview.
- First-session grounded generation happens automatically and never blocks editing.
- Rebuild works without clearing a successful preview.
- All generated words trace to eligible same-Space input.
- Empty or failed generation leaves deterministic example content intact.
- Preview generation changes content only, never appearance configuration.
- The experience reads as an editorial design tool, not a chatbot.
- Example and generated preview content cannot reach the public Yullo Link.
- Desktop, tablet, compact and reduced-motion behavior pass focused verification.

## 2026-09-27 integration hardening

- Preview requests now validate request/response contracts, cancel stale requests, and keep successful content when rebuilding fails.
- Session caching is keyed only by Space, so theme, emphasis, accent, background, visibility, and ordering edits update the shared renderer without calling the LLM again.
- The backend applies one canonical public entity policy, field-level projection, prompt context limits, configured prompt version, and empty-result handling.
- Public landing sections are built deterministically from confirmed public entities. Editor fixtures remain editor-only and are labeled **Example layout**.
- The public client validates landing content with the same strict Zod contract before rendering it.
- Focused verification: 7 backend tests, 14 frontend tests, TypeScript, and production build passed.

## 2026-09-29 source-to-preview wiring

- [x] Added authenticated URL, text and file source routes for both draft and live Yullo Spaces.
- [x] Source confirmation now queues full ingestion; source pause removes derived entities from public use.
- [x] Full ingestion now runs grounded, config-driven entity extraction and records its status separately from indexing and fact extraction.
- [x] Extracted entities remain private review candidates until the owner selects **Use on public page**.
- [x] Appearance rebuild can consume those confirmed public entities through the existing deterministic preview service.
- [x] Removed SpaceX/demo facts and local-only review actions from the real knowledge flow.
- [x] Added real source list/detail/content/retry APIs used by the knowledge UI.
- [x] Knowledge UI now refreshes source and extracted-entity state while ingestion runs, including after **Use source** and retry.
- [x] Removed the old client-only **Save facts** path; facts are now read from the canonical ingestion result instead of silently posting an ignored payload.
- [x] Optional URL labels persist as the source title.
- [x] Focused verification passed: 9 backend tests, Python compilation, frontend TypeScript checking, and the production UI build.
- [ ] Live database ingestion remains to be exercised manually; the database-backed source test could not connect to local PostgreSQL from the sandbox.

## 2026-10-03 owner review completion

- [x] Added owner- and Space-scoped canonical fact review endpoints.
- [x] Fact confirmation now sets `owner_confirmed`, legacy `verified`, and verification time together; rejection clears authoritative use.
- [x] Added source-linked structured-detail responses with stored evidence excerpts and locators.
- [x] Added structured-detail Edit, Keep private, Use on public page, and Reject actions.
- [x] Public use requires explicit confirmation and extracted details remain private by default.
- [x] Fact and entity changes increment `yullo_spaces.context_version` so downstream previews can detect stale context.
- [x] Source review is responsive: full-width on compact screens and a wider 720px review surface on desktop.
- [x] Python compilation, four focused fact-review tests, entity extraction, TypeScript, and production build passed.
- [ ] Database-backed isolation tests and live UI review still require the local PostgreSQL/browser environment; sandbox access remains blocked.

## 2026-10-08 live-content investigation (analysis only)

### 2026-10-13 fact-backed section fix — implemented

- Section generation now includes current authoritative facts from this Space's active knowledge bases, using the canonical fact/source lifecycle filter. Read-only SpaceX inspection found 10 eligible facts, including 3 use-case facts; structured offerings alone previously excluded Services.
- Added `sourceFactIds` item support and `groundedFactIds` response metadata in backend/frontend schemas. The LLM receives the requested section and evidence; unsupported references and wrong-section responses are rejected. No content is published during generation.
- Apply and public rendering revalidate fact references; revoked or unavailable support removes applied items. Examples, inline controls, confirmations and explicit Apply remain in place. Empty builds display actionable Knowledge guidance and preserve the current draft.
- Apply refreshes the appearance revision while preserving layout edits. Discard and Space changes invalidate pending generation responses.
- Files: `app/yullo/services/appearance_preview.py`, `schemas/appearance_preview.py`, `config/appearance.py`, `prompts/appearance.py`, `api/public.py`; frontend `AppearanceScreen.tsx`, preview schemas/hook and focused tests. Endpoints: POST preview, PUT preview/section, GET preview/live and public Space rendering. No migration needed or database writes performed for verification.
- Verification: 18 backend schema/service/API tests, 14 frontend preview tests and TypeScript passed. Database count was read-only. Repository diff review found existing unrelated whitespace issues, left untouched.
- Pending: browser interaction and a live AI-provider call. Automatic approval review rejected sending the Space's confirmed facts to the configured external provider without explicit approval for that transmission; mocked provider generation/Apply/revocation passed.

- Traced source ingestion → private extracted entity candidates → owner confirmation/public visibility → public entity projection → appearance preview/public landing renderer.
- Confirmed `AppearanceScreen` always merges frontend fixtures with generated content. `mergePreviewContent.ts` retains every fixture section lacking a nonempty grounded replacement; rebuilding cannot remove these examples.
- `useAppearancePreview.ts` caches ready and insufficient-context responses by Space in sessionStorage, returns cached results without revalidation, and does not consume context_version or compare inputFingerprint. Entity mutations invalidate entity queries, not this cache.
- `/appearance/preview` with force=true deterministically recomposes eligible entities; it does not ingest sources, approve candidates, persist content, or publish appearance. Its path still applies the LLM context character budget before deterministic composition. Landing sections are capped at four items.
- Public GET builds deterministic landing content from the same public entity projection; initial editor generation can instead use an LLM. Editor prompt starters are hardcoded in PublicLinkPreview. Thus sharing the renderer does not guarantee matching content.
- Additional renderer gap: AuraIntro gates section wrappers on presence of the entire content object, rather than a nonempty matching section. Missing sections can render fallback skeletons and Example layout labels publicly; verify and fix this boundary before claiming full public isolation.
- Recommended design, pending approval: default to canonical live public-eligible content plus unsaved appearance configuration; hide empty sections in the canvas and explain missing/unreviewed content in the inspector. Offer examples only through an explicit layout-sample mode. Reuse deterministic composition and prompt selection for editor/public routes, independent of optional AI generation limits. Revalidate using context_version/content revision after mutations and on revisit/focus; manual Refresh is a recovery control. Keep approval and publication boundaries intact. Define first-four curation/View all separately if all offerings must be accessible.
- Verification: source inspection only; browser tool reported no available browser. Exact database eligibility/counts and current session cache for Space c55cd855-a97f-45ae-aa1e-6e3b525c8480 were not inspected. No application code, database data, or publication state changed.
- Pending: approve design, implement within this plan, test empty/partial content, review/private/reject/source-pause invalidation, public/editor parity, cache revalidation, and live local integration.

## 2026-10-08 example visibility correction

- Replaced native browser confirmation prompts with a themed section confirmation dialog: accent icon, section label, action-specific explanation, Cancel/Confirm, blurred backdrop, and reduced-motion-aware entrance. Uses modal HTML dialog for focus containment and Escape handling, with accessible title/description. TypeScript passed; visual browser verification remains pending.

- Placement refinement: icons now sit inline immediately beside each section heading, with Example layout aligned to the right of the same heading row. Removed the separate icon row and its extra top spacing. Hidden sections retain the same heading and inline Unhide control.

- Final control placement: Hide/Unhide and Build/Rebuild are compact icon buttons at the top-right of each canvas section, with hover/focus tooltips, accessible labels, and confirmation before performing either action. Removed the duplicate example/build buttons from the inspector and the separate titled toolbar. Hidden placeholders retain only Unhide. Existing Apply/Discard review actions remain. TypeScript passed; live browser interaction is unverified.

- Section AI generation now sends `sectionType` to `/appearance/preview`. The backend selects matching approved public entities, explicitly asks the configured LLM what heading/items to display in that section, includes the JSON output schema, and validates returned section and entity IDs. Section builds use the LLM even with force=true and report unavailable instead of substituting deterministic content when providers fail. Successful output is displayed as the existing review draft, requiring Apply. Verified with 8 service tests (including mocked LLM request/response and missing-provider behavior) and TypeScript; a live provider call was not performed.

- Follow-up: every content section now has an editor-only toolbar above its canvas content. Hide retains a blank labeled placeholder with Unhide; the section content and AI build control return only after Unhide. Existing section visibility is used, so saving appearance also honors hidden sections publicly. Missing section types are normalized into the editor configuration so all five sample sections are available. AI controls in the inspector are also omitted for hidden sections. TypeScript passed; browser interaction remains unverified.

- User clarified that examples must appear by default as starting points for sections without real content. This supersedes the hidden-by-default decision below.
- Restored fixture fallback beneath live content and AI drafts. Explicit Hide example removes only the sample; Show example restores it. Building retains the sample until a supported draft replaces it; empty/failed generation leaves the starting point visible. Discard restores live content or the sample fallback.
- Example visibility is editor-only and resets when switching Spaces. Public content still requires Apply.

## 2026-10-08 explicit section review implementation

- [x] Appearance now opens from canonical live content and does not add examples by default.
- [x] Added per-section **Show example / Hide example** and **Build / Rebuild with AI** controls.
- [x] AI output remains an editor draft until the owner chooses **Apply**; **Discard** restores live content.
- [x] Applied section wording is stored in `yullo_configs.settings.appearance_applied_sections` and advances the Space context/publication version.
- [x] Apply revalidates that every item is grounded, still public, and belongs to the requested section.
- [x] Public rendering overlays applied wording only while its supporting entities remain eligible; private, rejected, paused or deleted support removes it.
- [x] Empty public sections no longer render sample skeletons or example labels.
- [x] Removed automatic session-cached AI generation; **Refresh live content** now reloads canonical data.
- Verification: focused backend schema/service/API tests passed; frontend preview tests, TypeScript and production build passed after the final test update. Live browser/database interaction remains unverified in this environment.
