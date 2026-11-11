# Yullo Appearance Studio Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Keep every feature implementation inside Yullo-owned directories except unavoidable route registration and Alembic migrations. Update the completion record after each task.

**Goal:** Build a responsive Appearance Studio where a Space owner shapes the real public Yullo Link through curated controls, assets, and validated Aura suggestions.

**Architecture:** `yullo_spaces.appearance_config` is the single published presentation configuration. The editor keeps an unsaved client draft and history; manual controls and Aura commands modify the same validated object. Editor preview and public page render the existing public Yullo component tree through one presentation resolver.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, PostgreSQL JSON, React 18, TypeScript, TanStack Query, React Hook Form, Zod, Radix primitives, Motion for React, React Dropzone, Lucide.

**Spec:** The approved contract is embedded below so this plan works without chat history.

## Global constraints

- Aura v1 is isolated to the selected Space. No cross-Space context, assets, or configuration.
- Feature backend code belongs under `app/yullo/`; frontend code belongs under `ui/src/yullo/`.
- Allowed shared edits are route registration, model discovery when required, and `alembic/versions/` migrations.
- Reuse the existing public Yullo renderer. Do not create a fake preview renderer.
- `appearance_config` is canonical; do not duplicate it in `yullo_configs.settings`.
- Manual controls and Aura update the same `draftPresentationConfig`.
- Aura returns allowlisted semantic configuration only—never HTML, JSX, CSS, JavaScript, coordinates, or arbitrary styles.
- Changes preview instantly but publish only after **Save appearance** succeeds.
- Aura never silently replaces owner-authored appearance.
- Preserve unrelated uncommitted work. Do not modify Support247 UI or flows.
- Use semantic Yullo tokens; do not hardcode editor colors in components.
- Do not add MUI, Ant Design, Chakra, or another broad UI library.

---

## Product and responsive contract

### Visual direction

The editor is a quiet creative workspace with an intelligent assistant and living preview. It must not resemble a SaaS settings dashboard, Webflow, Shopify, Wix, or a grid of configuration cards.

```text
Live preview first
Visual choices second
Aura assistance third
Technical configuration invisible
```

Use typography, spacing, subtle dividers, and restrained surfaces. Avoid cards around every section, excessive pills, strong gradients, glass effects, thick shadows, and decorative icons beside every label.

### Responsive layout

#### Desktop: width >=1200px

```css
.appearance-shell {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(360px, .9fr);
  min-height: calc(100dvh - var(--app-header-height));
}

.appearance-inspector {
  width: clamp(360px, 30vw, 430px);
}
```

- Left: 65–70% live preview canvas.
- Right: 30–35% creative inspector.
- Inspector is sticky below the Yullo header and scrolls independently.
- Preview may scroll independently; do not create more desktop scroll regions.

#### Tablet: 900–1199px

```css
.appearance-shell {
  grid-template-columns: minmax(0, 1.5fr) minmax(340px, 1fr);
}
```

- Preview remains primary at roughly 60%.
- Inspector narrows without shrinking controls below usable width.
- Preset tiles use two columns when space allows, otherwise one.
- Collapse secondary metadata before reducing touch targets.

#### Compact/mobile: width <=899px

- Stop using the split layout completely.
- Show explicit **Preview** and **Customize** modes.
- Keep both subtrees mounted so draft, chat, scroll, and upload state survive switching.
- Make the inactive subtree inert and hidden from pointer, keyboard, and assistive-technology interaction.
- Preview renders the real mobile public layout at full available width; never scale desktop HTML down.
- Customize contains Theme, Landing emphasis, Accent, Background, Assets, and Aura designer in one natural document flow.
- Remove sticky desktop inspector and nested content scrollers.
- Use `100dvh` and `env(safe-area-inset-bottom)`.

#### Responsive primitives

- Interactive controls: minimum 48px touch height; inputs remain at least 52px.
- Use `clamp()` for page padding, headings, gaps, and preview margins.
- Asset thumbnails wrap without horizontal page overflow.
- A 390px simulated mobile viewport is only used inside a sufficiently wide desktop canvas.
- Verify 360, 768, 899, 900, 1024, 1199, 1200, and 1440px widths.

### Editor composition

```text
Appearance                    Undo  Redo  Reset  Save appearance
-----------------------------------------------------------------
Live public preview                       Appearance inspector
                                           Theme
                                           Landing emphasis
                                           Accent
                                           Background
                                           Assets
                                           -------------------
                                           Aura designer
```

The preview frame uses an 18–22px radius, a subtle 1px border, and restrained shadow. Do not add fake browser chrome.

### Public experience invariant

```text
ConversationViewport
  PublicIntro
  Messages
  GenerativeUI
Composer
```

Sending a message must not replace the intro. It remains mounted and naturally scrolls upward as messages appear; the composer docks at the bottom.

### Motion

- Use `motion/react`.
- Easing `[0.22, 1, 0.36, 1]`.
- Fast 140–160ms; normal 180–220ms; structural 260–340ms.
- Theme changes crossfade semantic properties without remounting the public experience.
- Section reorder uses restrained layout animation around 280ms.
- Aura changes may receive a faint 500–800ms accent outline/wash.
- No bounce, shake, shimmer, perpetual pulse, or visible glow.
- Reduced motion removes translation, scale, sequencing, and travelling effects.

---

## Canonical presentation contract

```ts
interface SpacePresentationConfigV1 {
  schemaVersion: 1;
  themePreset: string;
  landingEmphasis: 'balanced' | 'visual' | 'services' | 'local' | 'minimal';
  accent: 'yullo' | 'blue' | 'cyan' | 'violet' | 'coral' | 'forest' | 'neutral';
  backgroundTreatment: 'soft' | 'light' | 'dark' | 'image';
  hero: {
    assetId?: string;
    layout: 'centered' | 'image_left' | 'image_right' | 'image_background';
  };
  sections: Array<{
    type: 'identity' | 'services' | 'portfolio' | 'products' | 'location' | 'featured' | 'prompt_starters';
    variant?: string;
    visible: boolean;
  }>;
  visualDensity: 'minimal' | 'balanced' | 'expressive';
  networkIntensity: 'none' | 'very_low' | 'low';
  presentationSource: 'default' | 'aura' | 'owner';
}
```

Backend Pydantic and frontend Zod contracts must match. Reject unknown keys and enum values. Version conversion is deterministic; never enable permissive extras.

### Draft and history

```text
publishedPresentationConfig
draftPresentationConfig
historyPast[]
historyFuture[]
```

- One manual action creates one history entry.
- One Aura command creates one history transaction even when several fields change.
- Undo/redo are local until Save.
- Reset offers published configuration and, when available, Aura recommendation.
- Saving owner changes sets `presentationSource = owner`.

### Purpose-specific registries

- Business: Clean, Professional, Technical, Warm.
- Creator: Editorial, Visual, Bold, Warm.
- Person: Minimal, Personal, Editorial, Professional.
- Organization: Community, Trustworthy, Editorial, Bold.

Hide irrelevant landing-emphasis values. Disable unsupported renderer options with a reason rather than silently falling back.

---

## File and directory ownership

### Backend

```text
app/yullo/
  api/
    appearance.py                 # thin authenticated routes
  schemas/
    appearance.py                 # strict config/request/response contracts
  services/
    persistence/
      appearance.py               # authorization, revision and canonical writes
    appearance_assistant.py       # recommendation and command translation
  config/
    appearance.py                 # provider/model/limits and preset settings
```

Optional durable asset model, only if the storage audit finds no suitable record:

```text
app/yullo/models/
  appearance_asset.py
alembic/versions/<revision>_add_yullo_appearance_assets.py
```

Do not create `services/forms/`, another persistence package, or unrestricted JSON patch services.

### Frontend

```text
ui/src/yullo/
  api/
    appearance.ts
  screens/
    appearance/
      AppearanceScreen.tsx
      components/
        AppearanceHeader.tsx
        AppearanceCanvas.tsx
        PublicLinkPreview.tsx
        DeviceSwitcher.tsx
        MobileModeSwitcher.tsx
        inspector/
          AppearanceInspector.tsx
          ThemePresetPicker.tsx
          LandingEmphasisPicker.tsx
          AccentPicker.tsx
          BackgroundPicker.tsx
          AssetManager.tsx
        aura/
          AppearanceAuraDesigner.tsx
          AuraAppearanceMessage.tsx
          AuraSuggestionChips.tsx
      hooks/
        useAppearanceDraft.ts
        useAppearanceHistory.ts
        useAppearanceAura.ts
      presentation/
        schema.ts
        presets.ts
        themeTokens.ts
        presentationResolver.ts
```

Extend rather than duplicate:

```text
ui/src/yullo/screens/public/PublicYulloLink.tsx
ui/src/yullo/screens/public/components/*
ui/src/yullo/screens/SpaceDashboard.tsx
```

Unavoidable shared wiring:

```text
ui/src/App.tsx                 # lazy Yullo route only
app/api/v1 router registration # include Yullo router only if required
```

Tests:

```text
tests/unit/yullo/appearance/
tests/api/yullo/test_appearance_api.py
ui/src/yullo/screens/appearance/__tests__/
```

---

## API contract

Base: `/api/v1/yullo/spaces/{space_id}/appearance`

### `GET /appearance`

Returns Space purpose/identity summary, `publishedConfig`, `effectiveConfig`, existing Aura recommendation, eligible assets, and revision.

### `PATCH /appearance`

Accept a complete validated config and `expectedRevision`. The server authenticates the owner, enforces `product=yullo`, locks the Space, rejects stale revisions, validates same-Space assets, writes `appearance_config`, calls `finalize_space_mutation`, commits atomically, and returns canonical config plus new revision.

### `POST /appearance/recommendation`

Returns a complete candidate from allowed Space identity, category, reviewed capabilities, and eligible assets. It never saves or overwrites owner configuration.

### `POST /appearance/command`

Accepts current draft and one owner instruction. Returns a validated candidate plus a short explanation and changed field paths. The browser decides whether to apply it.

### Assets

Reuse blob infrastructure. If durable records are missing, add Yullo-specific `/appearance/assets` upload/list/update/archive endpoints. Validate MIME, byte size, image dimensions, ownership, and same-Space references. Upload is independent of appearance Save; assigning a role is part of the draft.

### Public response

Return only published, policy-projected presentation config and public asset URLs. Never return storage keys, owner data, private metadata, or draft config.

---

## Implementation tasks

### Task 1: Canonical schemas and preset registry

**Files:**
- Create: `app/yullo/schemas/appearance.py`
- Create: `app/yullo/config/appearance.py`
- Create: `ui/src/yullo/screens/appearance/presentation/schema.ts`
- Create: `ui/src/yullo/screens/appearance/presentation/presets.ts`
- Test: `tests/unit/yullo/appearance/test_schema.py`

**Produces:** Strict contracts, purpose-specific presets, safe defaults, and deterministic legacy normalization.

- [ ] Write tests for valid config, unknown fields, invalid enums, duplicate sections, required identity section, and legacy/default normalization.
- [ ] Confirm tests fail before implementation.
- [ ] Implement matching Pydantic and Zod schemas with version 1.
- [ ] Add typed preset and landing-emphasis registries by purpose.
- [ ] Run focused schema and TypeScript checks.

### Task 2: Owner persistence and API

**Files:**
- Create: `app/yullo/services/persistence/appearance.py`
- Create: `app/yullo/api/appearance.py`
- Modify: existing Yullo router registration additively
- Test: `tests/api/yullo/test_appearance_api.py`

**Produces:** `get_appearance` and `update_appearance` with owner, Space, product, asset, and revision enforcement.

- [ ] Write API tests for owner read/write, foreign owner denial, non-Yullo denial, stale revision, invalid config, and save/reload equality.
- [ ] Resolve safe defaults without writing during GET.
- [ ] Implement complete-config PATCH; do not expose unrestricted JSON patching.
- [ ] Advance context/publication version through the canonical finalizer.
- [ ] Register route and run focused tests.

### Task 3: Public projection and shared renderer input

**Files:**
- Modify: `app/yullo/api/public.py`
- Modify: `ui/src/yullo/services/aura/types.ts`
- Create: `ui/src/yullo/screens/appearance/presentation/presentationResolver.ts`
- Create: `ui/src/yullo/screens/appearance/presentation/themeTokens.ts`
- Modify: existing public components only where presentation input is needed

**Produces:** One policy-projected DTO and resolver shared by live and preview rendering.

- [ ] Replace placeholder public identity values with policy-projected canonical values.
- [ ] Include only published config and public asset URLs.
- [ ] Resolve config to semantic variables and renderer variants.
- [ ] Keep public intro mounted through the chat transition.
- [ ] Confirm the default config preserves current public behavior.

### Task 4: Responsive Appearance shell

**Files:**
- Create: `ui/src/yullo/screens/appearance/AppearanceScreen.tsx`
- Create shell components listed above
- Modify: `ui/src/yullo/screens/SpaceDashboard.tsx`
- Modify: `ui/src/App.tsx` for lazy Yullo route only

**Produces:** Desktop/tablet split and mobile Preview/Customize modes using the real public renderer.

- [ ] Add authenticated `/yullo/spaces/:spaceId/appearance` route and enable the Appearance row.
- [ ] Implement exact >=1200, 900–1199, and <=899 layouts.
- [ ] Keep both mobile subtrees mounted and make the inactive one inert.
- [ ] Render real responsive public markup, not a scaled screenshot or duplicate preview.
- [ ] Add `100dvh`, safe-area behavior, clamp spacing, and overflow protection.
- [ ] Verify no mobile horizontal overflow or nested scrolling.

### Task 5: Draft, controls and history

**Files:**
- Create: `ui/src/yullo/api/appearance.ts`
- Create: `useAppearanceDraft.ts` and `useAppearanceHistory.ts`
- Create: inspector components listed above

**Produces:** Instant preview, dirty state, undo/redo, reset, save, and purpose-filtered controls.

- [ ] Fetch with owner+Space query keys.
- [ ] Initialize published/draft state without overwriting a dirty draft on refetch.
- [ ] Implement visual preset tiles, emphasis, accents, backgrounds, section visibility/order, density, and network intensity.
- [ ] Make one control action one history transaction.
- [ ] Implement Reset to published and Aura recommendation when present.
- [ ] Implement Save appearance → Saving… → Saved while keeping the page open.
- [ ] Add keyboard, focus, selected-state, ARIA, and reduced-motion behavior.

### Task 6: Appearance assets

**Files:**
- Reuse existing storage modules.
- Create a Yullo asset model/service only if no durable record fits.
- Create: `AssetManager.tsx`

**Produces:** Upload progress, thumbnails, alt text, safe records, and role assignment without requiring appearance Save.

- [ ] Audit blob and metadata contracts before adding a table.
- [ ] Validate image type, size, dimensions, and decode success server-side.
- [ ] Store durable IDs in config; never local URLs or storage secrets.
- [ ] Add image, update alt text, assign hero/featured/background role, and archive.
- [ ] Ensure thumbnails wrap and remain keyboard operable.

### Task 7: Aura recommendation and designer

**Files:**
- Create: `app/yullo/services/appearance_assistant.py`
- Extend: `app/yullo/api/appearance.py`
- Create: `useAppearanceAura.ts` and Aura components listed above

**Produces:** Safe recommendations and commands returning validated candidates without automatic persistence.

- [ ] Configure provider/model/timeout/context limits in Yullo config and use `get_async_openai_clients`.
- [ ] Ground input in the current Space's identity, category, reviewed eligible entities, and assets only.
- [ ] Require structured output and validate through the canonical schema.
- [ ] Merge against current draft server-side so unrelated settings remain unchanged.
- [ ] Return changed paths and one short explanation.
- [ ] Apply an accepted Aura result as one history transaction with temporary feedback.
- [ ] Preserve current draft and show a calm error if providers fail.

### Task 8: Responsive, accessibility and integration verification

**Files:**
- Test: `ui/src/yullo/screens/appearance/__tests__/`
- Update: this completion record

- [ ] Verify 360, 768, 899, 900, 1024, 1199, 1200, and 1440px.
- [ ] Verify mode switching preserves draft, upload, preview chat, and scroll state.
- [ ] Verify real mobile layout, touch targets, safe areas, no overflow, and no nested mobile scrollers.
- [ ] Verify app light/dark themes do not leak into preview presentation.
- [ ] Verify keyboard operation, focus, announcements, contrast, and reduced motion.
- [ ] Verify Save → reload → public Link renders identical normalized presentation.
- [ ] Verify foreign Space assets and owner access are rejected.
- [ ] Run focused backend tests, frontend tests, TypeScript checks, and Yullo public-page checks.

---

## Acceptance criteria

- Preview dominates desktop and tablet.
- Width <=899px always uses Preview/Customize modes and never squeezes the split layout.
- Preview and public page share components and presentation resolver.
- Mobile preview renders responsive markup, not scaled desktop content.
- Manual and Aura changes update one draft and one history.
- Save is revision-safe, owner-scoped, Space-scoped, and persists the exact validated preview.
- Aura cannot produce or persist code or arbitrary styles.
- Owner configuration is never silently overwritten.
- Appearance assets cannot cross Space boundaries.
- The editor imports no Support247 UI.
- No repository-root files or competing Appearance plans are created.

## Completion record

Status: **Implemented — automated verification passed; manual browser review remains blocked by saved browser permission**

Last updated: 2026-09-27

### Implemented

- Added strict matching Pydantic/Zod presentation contracts, purpose presets, semantic theme tokens, local undo/redo/reset, revision-safe Save, and Space-scoped Aura candidates.
- Added authenticated Appearance endpoints for read, complete-config update, recommendation, commands, and image asset lifecycle under `/api/v1/yullo/spaces/{space_id}/appearance`.
- Added isolated `yullo_appearance_assets` storage metadata and migration `a9e2c11d7f42`; migration is applied locally at head.
- Added JPEG/PNG/WebP/GIF decode, byte, pixel, owner, Space, reference, archive, and alt-text handling. Raw storage keys are never returned.
- Added policy-projected public appearance and referenced public asset delivery. Draft/unreferenced assets remain private.
- Added the responsive editor route, real shared public renderer preview, desktop/tablet split, mobile Preview/Customize modes, safe areas, touch sizing, history, controls, upload, image layout, section ordering/visibility, density, network intensity, and Aura designer.
- Preview chat remains local and cannot create visitor sessions or analytics.
- Enabled **Appearance → Open studio** from the Space dashboard.
- Fixed the existing Yullo publication-state comparison so live appearance changes advance the published version.
- Added Appearance-level **Live/Private**, open-public-link, and publish/hide controls using the existing owner-scoped lifecycle service.
- Added guarded internal navigation, a mobile Back action, and a safe-area-aware sticky mobile Save bar.
- Grouped secondary controls into Content, Images, and Advanced panels so the inspector is shorter and easier to scan.
- Strengthened theme presets through content width, spacing, radius, shadow, title scale, section priority, and genuinely different image layouts.
- Replaced generic preview cards with editorial service rows, irregular portfolio composition, ruled product/location sections, and an accent-rail feature treatment.
- Made example content neutral and visibly labeled; public pages now receive only deterministic, policy-projected confirmed entities.
- Made asset removal draft-safe: referenced images are detached and saved before deletion, while uploads and alt text clearly disclose immediate persistence.
- Added per-owner/Space rate limits to Appearance uploads and all LLM-backed preview, recommendation, and command endpoints.
- Restored Northstar-style interactive chat behavior inside the editor through a local, non-persisted preview responder that uses the current Space name and current preview sections; it never creates a visitor session.
- Rebuild now remounts the preview experience, resets its local chat state, reruns entrance motion, and reports ready, insufficient-context, or failed outcomes visibly.
- Theme, landing emphasis, accent, background, section visibility, and section order all continue to drive the same shared public/chat renderer immediately; Save publishes that exact configuration.
- Added main window `contentLayout` option (`left`, `center`, `right`, `stretch`) with icons (`AlignLeft`, `AlignCenter`, `AlignRight`, `StretchHorizontal`) in `AppearanceInspector` side settings panel. Both backend Pydantic schema and frontend Zod schema validate this setting with default `'center'` for backwards compatibility. Main window components (`IdentityBlock`, `AuraIntro`, `PlaceholderSection`, `PromptStarters`) dynamically adapt layout and alignment.
- Implemented AI-driven appearance layout generation & rebuild flow:
  - **First-time trigger**: When a Space appearance studio opens for the first time and the layout hasn't been generated yet (`publishedConfig.presentationSource === 'default'`), automatically triggers AI layout generation. If already generated/customized, it does not re-generate on load.
  - **Rebuild trigger**: The "Rebuild layout with AI" button in `PreviewDirection` regenerates the layout and extracts content from Space facts and entities.
  - **`LayoutConfirmModal`**: Displays the AI response with visual layout specs (Theme, Accent, Content Layout, 2-Column Grid badges) and generated section headings & cards. Clicking "Confirm & Apply to Preview" applies the presentation config to history and populates preview content; clicking "Cancel" discards.
  - **2-Column / 3-Column Grid Boxes**: `MockServices` and `MockProducts` in `AuraIntro.tsx` support `variant === 'grid_2col'` (rendering cards in 2x2 or 2x3 grid boxes stacked side-by-side) and `'grid_3col'`, featuring in-place editing, accent pills, and hover states.
  - **Backend Endpoint**: `POST /api/v1/yullo/spaces/{space_id}/appearance/rebuild-layout` and `rebuild_space_layout` service in `appearance_assistant.py` uniting layout recommendation and grounded preview generation with deterministic fallbacks.

### Verification

- Backend schema/asset tests: all passed.
- Backend pytest `tests/unit/yullo/test_appearance_preview.py`: `10 passed` including `test_rebuild_space_layout_configures_grid_2col`.
- Frontend presentation tests: all passed.
- Full frontend test suite: `19 test files passed (84 passed)` including `LayoutConfirmModal.test.tsx` and `PreviewDirection.test.tsx`.
- TypeScript: `npm run type-check` passed without error.
- Verified live Vite dev server (port 3000) and backend server (port 8001) returning 200 OK.

### Remaining review constraints

- Live visual review at the responsive breakpoint matrix could not run because the saved in-app-browser permission blocks `http://localhost:3000`. Automated CSS, TypeScript, focused unit/API tests, and the production build completed.
- The approved V1 config defines one `hero.assetId`; it supports opening/hero and image-background use. A distinct featured-asset role needs a future contract field and was not invented here.
- Aura provider failure behavior is implemented and preserves the draft. A live provider recommendation was not invoked during verification.


## 2026-11-12 preview/public viewport parity — implemented

User reported appearance preview/public page spacing and proportions differed, including excessive public-page side margins. Preserve the shared renderer and draft/publish behavior; no tests requested.

- `components/PublicLinkPreview.tsx`: render the existing PublicSpaceExperience through a React portal into a same-origin sandboxed iframe. Desktop uses the host viewport (minimum 1280px for desktop simulation); mobile uses 390x844. ResizeObserver scales the complete viewport proportionally to the panel instead of changing content layout to fit the editor column. Mobile width remains capped even at compact editor breakpoints; frame height follows the viewport aspect ratio. CSS media queries and vw/vh now use the preview's own viewport. Existing section-edit context and draft callbacks remain attached through the portal. Copy/synchronize application styles and root theme attributes, with observer cleanup; preserve native dialog support. No additional backend request or public-link publication.
- `presentation/themeTokens.ts`: widen the common per-theme content limits by 25%, capped at 1440px, preserving the stretch option. This reduces public-page side gaps and applies the same width to the preview.
- `public/components/AuraExperience.tsx`: align composer maximum width with the shared presentation width and remove nested horizontal padding. Add min-height:0 to the flexible scrolling area so the composer stays visible instead of competing with a full-height child.
- Verification: TypeScript and focused lint passed before final review; final repeat pending below. No tests, live configuration/data writes or publishing. Browser visual comparison was attempted, but the browser access host is unavailable. Iframe interactions, focus/native dialogs, responsive rendering and exact visual parity therefore remain unverified. Unsaved draft/example data can still intentionally differ from the published public page until saved.
- Final verification: frontend TypeScript, focused ESLint and scoped diff whitespace checks passed after the final iframe sizing/theme changes. No tests ran. Browser/runtime parity remains unverified for the reason above.

## 2026-11-12 section mismatch follow-up

- User correctly identified section/content differences beyond viewport sizing. Read-only inspection of Space e79e184d-0a84-4008-aad8-02afc7a05934 found no stored published sections (public resolves its default config), while saved editor draft specifies grid_2col services and grid_3col portfolio. Draft and published content overrides also exist. No config was published or changed in the database.
- `AppearanceScreen.tsx` previously merged fixtures into live content by default, causing preview-only example sections. It now starts from actual live content (empty until loaded), then overlays authorized saved/session drafts. Explicit example toggles retain fixture previews. No generation, approval or publishing capability was removed.
- `AppearanceHeader.tsx` clarifies 'Draft saved · not published'. Different draft variants remain intentional until Save appearance; using the shared renderer does not imply the draft equals published state. The previous viewport-only change did not resolve these data/config differences.
- Static type/lint results pending below. No tests, provider calls or live writes; browser visual comparison remains unavailable.
- Final checks: TypeScript and scoped whitespace passed; focused lint reported no errors and one existing AppearanceScreen effect dependency warning (`history`, line 245). No tests ran. Actual post-save/public parity remains unverified.

## 2026-11-12 preview zoom — implemented

- Added keyboard-accessible minus/plus controls, live percentage and Fit reset beside device controls in AppearanceCanvas. Zoom ranges from 50% to 200% of the fitted preview, in 25% increments; limit buttons disable appropriately. Uses existing theme tokens and wraps on narrow layouts.
- PublicLinkPreview now measures a stable scroll viewport and scales the existing iframe/frame dimensions by the selected zoom without changing the simulated desktop/mobile viewport or published layout. A centered max-content surface makes both edges reachable when zoomed, with horizontal/vertical scrolling and a stable scrollbar gutter. Fit includes frame borders to avoid artificial horizontal overflow.
- AppearanceScreen keys the canvas by Space instead of every content update, preserving zoom/scroll and existing iframe/editor state through draft edits; switching Spaces remounts normally. No public appearance config or persistence/API change.
- Verification: TypeScript, focused zoom-component ESLint and scoped whitespace checks passed. No tests ran per user instruction. Browser host remains unavailable, so visual zoom/scroll/focus behavior is not verified.

## 2026-11-12 maximize preview workspace — implemented

- Removed the desktop preview's 1080px cap in both sizing logic and frame CSS. Fit now fills the available preview column, retaining the 390px mobile simulation and proportional iframe rendering/zoom.
- Changed the editor grid to a flexible preview column plus a 300–340px inspector; inspector fills its own column, removing the prior mismatch between a fractional column and a narrower right-aligned inspector. At 900–1199px use a 300px inspector; existing compact/mobile mode stays intact.
- Reduced desktop preview gutters to 8px and toolbar gutters to 12px. Inspector inner gutters are 16px; preview direction text/button stack to avoid overflowing the narrower sidebar. All settings remain available.
- Verification: frontend TypeScript, focused preview component lint and scoped whitespace checks passed. No tests or live data/config changes. Browser rendering/scroll behavior remains unverified because browser access is unavailable.
