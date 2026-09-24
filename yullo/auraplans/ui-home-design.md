# Yullo Home UI Design Implementation Plan

> **For coding agents:** Implement only the frontend visual system described here. Build the UI with local typed fixtures and callback props. Do not connect authentication, APIs, database models, Aura runtime state, or backend routes in this plan.

**Goal:** Build a polished, responsive Yullo Home interface that lets design and interaction quality be reviewed independently before backend integration.

**Architecture:** Create a pure `YulloHomeView` composed of small Yullo-owned presentation components. Feed it typed fixture states through a development-only preview screen. Keep all data access and navigation behind callback props so the later integration plan can connect real Home data without redesigning components.

**Default palette:** Light only.

**Frontend stack:** React 18, TypeScript, Tailwind CSS plus Yullo-scoped CSS variables, Motion for React from `motion/react`, Radix Popover/Tooltip/VisuallyHidden, Lucide icons, `clsx`, and `tailwind-merge` where class composition is required.

**Source direction:** The approved Yullo Home design: calm, premium, spacious, editorial, slightly alive, and free of dashboard-card styling.

## Reuse boundary

This UI plan deliberately reuses no Support247 frontend feature code. Reuse is limited to React, routing/motion/accessibility packages, font/image assets, and a utility only after it is proven product-neutral and has no Support247 styling, state, copy, DTO, or navigation assumptions. Keep all Yullo display types, fixtures, components, tokens, motion, and callbacks in `ui/src/yullo/`. Backend shared-schema reuse is handled by the integration plans and must remain invisible to these presentation components.

---

## 1. Scope

### Included

- Complete desktop, tablet, and mobile Home composition.
- Default Light color system.
- Typography, spacing, dividers, buttons, icon controls, and status treatments.
- Header, greeting, zero/one/multiple-Space layouts.
- Attention, recent activity, and one suggestion.
- Loading, empty, partial, and error visual states.
- Hover, focus, entrance, insertion, removal, and network motion.
- Reduced-motion behavior.
- Keyboard, screen-reader, contrast, and touch accessibility.
- A development preview with selectable UI scenarios.
- Pure TypeScript display types and fixture data.

### Excluded

- Authentication and route guards.
- API clients, TanStack Query, server schemas, and Zod response parsing.
- Database or backend work.
- Real Aura, Space, activity, attention, or suggestion derivation.
- Real account menu actions, logout, navigation, mutations, and toasts.
- Theme switching, Warm theme, Dark theme, and System theme.
- Public Yullo Space/Aura UI changes.
- Support247 components, state, styles, clients, or layouts.
- Final production route replacement.

The UI layer must not guess integration behavior. Every interactive action calls a typed callback supplied by the future container.

---

## 2. Frontend isolation rules

- Keep all new files under `ui/src/yullo/`.
- Do not import from:
  - `ui/src/components/`
  - `ui/src/screens/`
  - `ui/src/features/`
  - `ui/src/renderengine/`
  - `ui/src/store/`
  - Support247 configuration, theme, API, or layout modules.
- Framework packages may be used directly.
- Raw approved font and logo assets may be referenced, but the Yullo Home owns its component styles.
- Do not create generic shared components during this task.
- Do not modify the public marketing page `ui/src/yullo/screens/YulloHome.tsx`.
- Do not modify the public Aura experience.
- Do not replace `/yullo/home` in production during this plan.

---

## 3. Design intent

Home answers:

> **What is happening with my Yullo presence right now?**

It should feel like:

```text
editorial homepage
+ personal operating surface
+ living digital presence
```

It must not feel like:

```text
admin dashboard
analytics product
widget grid
settings editor
AI control panel
```

Use typography, whitespace, thin dividers, identity nodes, concise status, activity, and sparse network motion. Do not put every section inside a rounded container.

---

## 4. Default Light visual system

Create `ui/src/yullo/screens/home/styles/home-tokens.css` and scope every token to `.yullo-home-ui`.

```css
.yullo-home-ui {
  --yh-canvas: #f6f7f5;
  --yh-surface: #ffffff;
  --yh-surface-soft: #eef1f3;
  --yh-surface-hover: rgba(20, 25, 35, 0.025);

  --yh-text-primary: #171b22;
  --yh-text-secondary: #69707c;
  --yh-text-muted: #8b919b;

  --yh-border: rgba(20, 25, 35, 0.08);
  --yh-border-strong: rgba(20, 25, 35, 0.16);

  --yh-yellow: #f3dc39;
  --yh-yellow-soft: #fff7be;
  --yh-attention: #c99918;
  --yh-danger: #b44a4a;

  --yh-network-cyan: #76bfd2;
  --yh-network-violet: #9589d9;

  --yh-focus: #3559d7;
  --yh-shadow-soft: 0 12px 36px rgba(20, 25, 35, 0.08);

  --yh-radius-sm: 8px;
  --yh-radius-md: 12px;
  --yh-radius-dialog: 16px;

  --yh-content-width: 1180px;
  --yh-page-padding: clamp(24px, 5vw, 72px);
}
```

Rules:

- Canvas fills the viewport.
- White surface is reserved for popovers/dialogs, not large page panels.
- Yellow indicates Aura, live/published identity, or the single primary action.
- Red appears only for a real unavailable/failure state.
- Cyan and violet appear only in sparse network signals.
- Components use semantic variables only; do not repeat hex values inside TSX.
- Do not implement alternate theme selectors in this plan.

---

## 5. Typography

### Font families

- **Satoshi:** Yullo wordmark, greeting, Space name, identity text.
- **Instrument Sans:** body, controls, metadata, activity, timestamps.

Satoshi already exists as a local asset. Instrument Sans must be a licensed, approved, checked-in local asset. Do not download it automatically or introduce a runtime font request. Until the asset is approved, use the declared fallback stack without blocking layout work.

```css
--yh-font-display: "Satoshi", system-ui, sans-serif;
--yh-font-body: "Instrument Sans", Inter, system-ui, sans-serif;
```

### Type scale

| Role | Desktop | Mobile | Weight | Line height |
|---|---:|---:|---:|---:|
| Greeting | 34px | 30px | 500 | 1.16 |
| Featured Space | 32px | 28px | 550 | 1.16 |
| Space row name | 26px | 22px | 550 | 1.2 |
| Section heading | 16px | 15px | 600 | 1.35 |
| Body | 16px | 15px | 400 | 1.6 |
| Metadata/status | 14px | 13px | 450 | 1.45 |
| Timestamp | 13px | 12px | 450 | 1.4 |

Use `Your Spaces`, `Needs attention`, `Recent`, and `Suggested` in title case. Avoid all-uppercase dashboard labels.

---

## 6. Page composition

### Desktop

```text
YULLO                                             AS


Good evening, Akhil.
Here’s what’s happening across your spaces.


Your Spaces

●  Northstar Studio                              →
   Brand and product design
   yullo.co/northstar
   Aura live · 3 new conversations

──────────────────────────────────────────────────

●  Offers.Run                                    →
   Offer discovery platform
   Aura live · 1 thing needs attention

──────────────────────────────────────────────────

+ Create another Space


Needs attention

Pricing differs between your website and brochure.
Website says ₹45k · Brochure says ₹50k       Review →

──────────────────────────────────────────────────

Recent

● Someone asked Northstar about pricing          8m
│
● A new enquiry came in                         42m
│
● Aura learned from your updated website         2h


Suggested

Northstar gets frequent questions about consultations.
Add a booking option →
```

### Container and spacing

```css
max-width: var(--yh-content-width);
padding-inline: var(--yh-page-padding);
margin-inline: auto;
```

| Relationship | Desktop | Mobile |
|---|---:|---:|
| Top edge to header | 24–32px | 18–24px |
| Header to greeting | 64px | 48px |
| Greeting to Spaces | 60px | 48px |
| Space row vertical padding | 30–36px | 24–28px |
| Spaces to attention | 72px | 56px |
| Attention to recent | 64px | 52px |
| Recent to suggestion | 56px | 48px |
| Bottom page breathing room | 96px | 88px + safe area |

No giant enclosing panel, sidebar, breadcrumb, dashboard grid, or floating create action.

---

## 7. Pure display contract

Create UI-only types in `ui/src/yullo/screens/home/types.ts`.

```ts
export type HomeSpaceStatus =
  | 'draft'
  | 'learning'
  | 'updating'
  | 'live'
  | 'needs_review'
  | 'unavailable'

export interface HomeSpaceViewModel {
  id: string
  name: string
  description?: string
  publicLabel?: string
  logoUrl?: string
  status: HomeSpaceStatus
  statusLabel: string
  activityLabel?: string
}

export interface HomeAttentionViewModel {
  id: string
  title: string
  detail?: string
  actionLabel: string
}

export interface HomeActivityViewModel {
  id: string
  label: string
  relativeTime: string
  absoluteTime: string
  isNew?: boolean
}

export interface HomeSuggestionViewModel {
  id: string
  reason: string
  actionLabel: string
}

export interface YulloHomeViewProps {
  greeting: string
  supportText: string
  accountInitials: string
  spaces: HomeSpaceViewModel[]
  attention: HomeAttentionViewModel[]
  activity: HomeActivityViewModel[]
  suggestion?: HomeSuggestionViewModel
  state?: 'ready' | 'loading' | 'error'
  onRetry?: () => void
  onAccountPress?: () => void
  onCreateSpace?: () => void
  onOpenSpace?: (spaceId: string) => void
  onSpaceMenu?: (spaceId: string) => void
  onAttentionAction?: (attentionId: string) => void
  onSuggestionAction?: (suggestionId: string) => void
}
```

Rules:

- View components receive display-ready strings.
- Components do not fetch, parse, authorize, derive status, build URLs, or inspect backend fields.
- Fixtures live outside components.
- Callback props are optional in the visual preview but controls must still expose correct disabled semantics if absent.
- Do not use `dangerouslySetInnerHTML`.

---

## 8. Component design

### `YulloHomeView`

- Owns page landmarks, layout rhythm, entrance choreography, and state selection.
- Uses `<header>` and `<main>`.
- Never knows about routes, API clients, cookies, or query state.

### `HomeHeader`

```text
YULLO                                             AS
```

- Wordmark on left.
- Account initials on right.
- No theme control in this default-color-only plan.
- No search, sidebar button, breadcrumb, notification bell, or Create button.
- Account button opens a UI-only Radix Popover containing placeholder account identity and callback-driven actions.

### `HomeGreeting`

- One display-font greeting.
- One body-font support sentence.
- No hero illustration or 64px marketing headline.

### `SpacesSection`

Chooses one of three pure presentations:

- zero Spaces → `ZeroSpacesState`;
- one Space → `SingleSpaceFeature`;
- two or more → editorial `SpaceRow` list.

### `SingleSpaceFeature`

- Does not show `Your Spaces` as a collection heading.
- Shows node/logo, Space name, description, public label, Aura state, activity line, and `Open Space →`.
- Remains flat and integrated into the page.

### `SpaceRow`

- Main content is one callback-driven button/link-shaped control.
- Secondary ellipsis action is a separate sibling control, never nested.
- Row has no card shadow, scale, or permanent rounded container.
- Divider follows the row except after the last item.

### `SpaceStatus`

| Status | Marker | Motion |
|---|---|---|
| `live` | Yellow center | Slow opacity breath |
| `learning` | Cyan moving toward yellow | One restrained travel loop every 8–12s |
| `updating` | Short connection trace | Runs once on state entry |
| `needs_review` | Static warm marker | None |
| `draft` | Neutral outlined node | None |
| `unavailable` | Muted red marker + text | None |

### `AttentionSection`

- Stronger than analytics but not a warning card.
- Title/detail/action form an editorial row.
- Multiple items use dividers.
- Empty state contains only:

```text
Everything looks good.
Aura is up to date.
```

### `ActivitySection`

- Dot-and-line timeline.
- Label receives available width; timestamp stays readable.
- `isNew` may add a tiny yellow marker that settles into normal state.
- No metrics, charts, avatars, or visitor message content.

### `SuggestionSection`

- Zero or one item.
- One reason and one text action.
- No progress score, carousel, completion meter, or filled card.

### `NetworkSignal`

- Small SVG/CSS motif with 3–5 nodes.
- Uses currentColor/CSS variables.
- `aria-hidden`, non-interactive, and pointer-free.
- Reusable only inside this Yullo Home feature.

### `HomeSkeleton`

- Structural text lines and dividers.
- Same approximate dimensions as loaded content.
- Subtle opacity pulse; no moving shimmer.

### `HomeError`

```text
We couldn't load your Yullo Home.
Try again →
```

- No error code, technical copy, giant red panel, or stack trace.

---

## 9. Buttons and UI primitives

Create only Yullo-owned primitives required by the visual preview:

```text
YulloTextAction
YulloIconButton
YulloPrimaryButton
YulloPopover
YulloTooltip
```

### Primary

- Used for zero-state `Create Space` only.
- Yellow background, dark text, 44–48px height, 10px radius.
- Hover slightly darkens yellow; no glow.
- Press scale `0.98` for 90ms unless reduced motion.

### Text action

- Most common action.
- Text plus arrow.
- Underline or arrow shift on hover/focus.
- No filled container.

### Icon button

- Minimum 44×44px target.
- Visible tooltip and accessible name.
- Neutral transparent rest state.
- Subtle soft surface on hover/focus.

Radix supplies behavior only. Yullo tokens and components supply appearance.

---

## 10. Motion specification

Use `motion/react` consistently. Do not mix `framer-motion` and `motion/react` inside this feature.

```ts
export const YULLO_EASE = [0.22, 1, 0.36, 1] as const
```

### Page entrance

| Time | Element | Motion |
|---:|---|---|
| 0ms | Canvas | Appears immediately |
| 50ms | Greeting | opacity 0→1, y 8→0 |
| 110ms | Spaces | opacity 0→1, y 8→0 |
| 170ms | Attention, Recent, Suggested | opacity 0→1, y 6→0 |

Duration is 240ms per group. Do not stagger every row or sentence.

### Space row

- Name x `0 → 2px`, 180ms.
- Arrow x `0 → 3px`, 180ms.
- Logo/node saturation or opacity increases slightly.
- Faint horizontal trace opacity `0 → 1 → 0`.
- Whole row never scales or lifts.

### Aura live marker

- Opacity `0.75 → 1 → 0.75`.
- Optional scale `1 → 1.08 → 1`.
- Duration 4–6 seconds.
- Keep the surrounding row still.

### Activity insertion

- Only genuinely new item IDs animate.
- opacity `0 → 1`, y `-4px → 0`, 200ms.
- Do not replay all items when props rerender.

### Attention removal

- opacity `1 → 0`, 140ms.
- height collapses softly after fade.
- Empty state crossfades if the list becomes empty.
- No celebration animation.

### Signature Yullo moment

On initial ready-state mount:

1. Space nodes appear independently.
2. A very faint line forms between account identity and active Space nodes.
3. The line fades away.
4. Page becomes still.

Total duration: 500–700ms. Run once per preview mount, never continuously.

### Reduced motion

When `prefers-reduced-motion: reduce`:

- remove y/x transforms;
- remove pulse travel;
- remove breathing scale;
- remove signature connection drawing;
- remove height animation where it causes movement;
- retain short opacity changes or immediate transitions.

Motion must never delay visibility, focus, or interaction.

---

## 11. Responsive design

### Breakpoints

Use content behavior rather than dashboard grids:

- Mobile: `320–639px`
- Tablet: `640–1023px`
- Desktop: `1024px+`

### Mobile composition

```text
YULLO                                           AS

Good evening.
Here’s what’s happening.

Your Spaces

● Northstar Studio
  Brand and product design

  Aura live
  3 new conversations                         →

────────────────────────────────────────────────

● Offers.Run
  Aura live
  Needs attention                             →

+ Create another Space


Needs attention

Pricing differs between your website
and brochure.

Review →


Recent

● New enquiry                                  12m
● Aura learned from website                     2h
```

Rules:

- No horizontal scroll at 320px.
- Do not transform the page into stacked cards.
- Description and status wrap before the arrow is displaced.
- Activity timestamp uses a fixed small column only when enough width exists; otherwise it drops below.
- Apply `padding-bottom: calc(88px + env(safe-area-inset-bottom))`.
- Do not implement bottom navigation in this plan.

---

## 12. Accessibility

- One `<h1>` for the greeting or page identity; section headings follow in order.
- Spaces, attention, and activity use semantic lists.
- Activity timestamps use `<time dateTime>` with full accessible date.
- Icon-only controls have `aria-label` and tooltip text.
- Decorative network SVGs use `aria-hidden="true"` and `focusable="false"`.
- Status never relies on color alone; visible status text is mandatory.
- Minimum interactive target is 44×44px.
- Focus ring uses `--yh-focus` and remains visible against canvas, surface, yellow, and soft yellow.
- Keyboard order follows the visual order.
- Popover closes on Escape and restores focus to its trigger.
- No hover-only action; focus-visible reveals the same affordance.
- Muted text, yellow controls, and attention treatment meet WCAG AA.
- Loading state uses `aria-busy`; error/retry uses a concise status announcement.
- Motion respects OS reduced-motion settings.

---

## 13. Preview scenarios

Create `ui/src/yullo/screens/home/preview/homeFixtures.ts` and `YulloHomeDesignPreview.tsx`.

Required scenarios:

1. Zero Spaces.
2. One live Space.
3. One draft Space.
4. Multiple Spaces with mixed status.
5. Multiple attention items.
6. Empty attention state.
7. Activity with new and older items.
8. No suggestion.
9. Loading.
10. Error.
11. Long Space names and wrapped descriptions.
12. Missing logo and missing description.

The preview selector is development tooling, not part of the Home composition. Keep it outside `.yullo-home-ui` or in a separate fixed dev-only control. It may switch fixtures and replay entrance motion.

Expose it through a development-only route such as `/yullo/design/home`. The route must not exist in a production build.

---

## 14. File structure

```text
ui/src/yullo/screens/home/
├── YulloHomeView.tsx
├── types.ts
├── components/
│   ├── HomeHeader.tsx
│   ├── HomeGreeting.tsx
│   ├── SpacesSection.tsx
│   ├── ZeroSpacesState.tsx
│   ├── SingleSpaceFeature.tsx
│   ├── SpaceRow.tsx
│   ├── SpaceStatus.tsx
│   ├── AttentionSection.tsx
│   ├── ActivitySection.tsx
│   ├── SuggestionSection.tsx
│   ├── NetworkSignal.tsx
│   ├── HomeSkeleton.tsx
│   └── HomeError.tsx
├── primitives/
│   ├── YulloPrimaryButton.tsx
│   ├── YulloTextAction.tsx
│   ├── YulloIconButton.tsx
│   ├── YulloPopover.tsx
│   └── YulloTooltip.tsx
├── motion/
│   └── homeMotion.ts
├── preview/
│   ├── homeFixtures.ts
│   └── YulloHomeDesignPreview.tsx
└── styles/
    └── home-tokens.css
```

Each component remains small and presentation-only. Do not introduce `DashboardCard`, `MetricCard`, `StatsCard`, or `WidgetCard`.

---

## 15. Step-by-step implementation

### Task 1: Establish UI-only types and fixtures

**Files:**

- Create: `ui/src/yullo/screens/home/types.ts`
- Create: `ui/src/yullo/screens/home/preview/homeFixtures.ts`

- [ ] Add the pure display contracts from Section 7.
- [ ] Add all 12 preview scenarios.
- [ ] Keep fixture business data clearly local and outside production components.
- [ ] Include short, long, missing, empty, and failure content.
- [ ] Ensure no fixture contains API response assumptions or authentication state.

### Task 2: Add the default visual tokens and typography

**Files:**

- Create: `ui/src/yullo/screens/home/styles/home-tokens.css`
- Review: Yullo font assets and `ui/tailwind.config.js`

- [ ] Add the scoped Light tokens exactly once.
- [ ] Add display/body font stacks.
- [ ] Add page width, spacing, radii, focus, and shadow variables.
- [ ] Add base selection, focus-visible, and reduced-motion rules scoped to Home.
- [ ] Do not add theme switching or global Support247 CSS.

### Task 3: Build Yullo-owned primitives

**Files:**

- Create: files under `ui/src/yullo/screens/home/primitives/`.

- [ ] Build primary, text, and icon actions with consistent focus/disabled states.
- [ ] Wrap Radix Popover and Tooltip behavior without importing shared UI wrappers.
- [ ] Keep every icon action at least 44×44px.
- [ ] Apply visual styles only through Home tokens.
- [ ] Ensure callbacks remain optional for static preview states.

### Task 4: Build the Home shell, header, and greeting

**Files:**

- Create: `YulloHomeView.tsx`
- Create: `components/HomeHeader.tsx`
- Create: `components/HomeGreeting.tsx`

- [ ] Implement page landmarks and editorial container.
- [ ] Build wordmark and account control with no theme switcher.
- [ ] Build account popover as a visual/callback shell only.
- [ ] Implement exact heading/body sizing and spacing.
- [ ] Keep production navigation and logout outside this component.

### Task 5: Build zero, single, and multiple Space views

**Files:**

- Create: `components/SpacesSection.tsx`
- Create: `components/ZeroSpacesState.tsx`
- Create: `components/SingleSpaceFeature.tsx`
- Create: `components/SpaceRow.tsx`
- Create: `components/SpaceStatus.tsx`
- Create: `components/NetworkSignal.tsx`

- [ ] Select layout based only on `spaces.length`.
- [ ] Implement the dedicated one-Space treatment.
- [ ] Implement the multi-Space editorial list and dividers.
- [ ] Add status text/marker for all six statuses.
- [ ] Implement separate primary-row and secondary-menu controls.
- [ ] Avoid panels, shadows, scale, and nested cards.

### Task 6: Build attention, activity, and suggestion

**Files:**

- Create: `components/AttentionSection.tsx`
- Create: `components/ActivitySection.tsx`
- Create: `components/SuggestionSection.tsx`

- [ ] Implement attention list and compact healthy empty state.
- [ ] Implement human timeline layout with semantic time elements.
- [ ] Implement one optional suggestion.
- [ ] Wire callback IDs without interpreting them.
- [ ] Confirm no metrics, charts, scores, or progress bars appear.

### Task 7: Add motion choreography

**Files:**

- Create: `motion/homeMotion.ts`
- Modify: presentation components as required.

- [ ] Add shared easing and grouped entrance variants.
- [ ] Add row name/arrow hover motion.
- [ ] Add status-specific motion.
- [ ] Add new activity insertion and attention removal behavior.
- [ ] Add the one-shot 500–700ms signature connection.
- [ ] Add reduced-motion variants with no travel or breathing scale.
- [ ] Prevent animation-driven layout shift.

### Task 8: Add loading and error compositions

**Files:**

- Create: `components/HomeSkeleton.tsx`
- Create: `components/HomeError.tsx`
- Modify: `YulloHomeView.tsx`

- [ ] Add structural line/divider skeletons.
- [ ] Use subtle opacity pulse without shimmer.
- [ ] Add human error copy and callback-driven retry.
- [ ] Keep header/account visible in all page states.
- [ ] Avoid technical error details and giant warning panels.

### Task 9: Complete responsive and accessible behavior

**Files:**

- Modify: all Home UI files.

- [ ] Verify 320px, 375px, 768px, 1024px, and 1440px compositions.
- [ ] Verify long text wrapping and missing optional content.
- [ ] Verify semantic landmarks, headings, lists, labels, and time elements.
- [ ] Verify keyboard operation and focus restoration.
- [ ] Verify visible focus and color contrast.
- [ ] Verify 44×44px targets and mobile safe-area spacing.
- [ ] Verify OS reduced-motion behavior.

### Task 10: Build the development design preview

**Files:**

- Create: `preview/YulloHomeDesignPreview.tsx`
- Modify: `ui/src/App.tsx` only for a development-only lazy route.

- [ ] Add a fixture selector separate from the page design.
- [ ] Allow viewport/state inspection without backend calls.
- [ ] Allow entrance-motion replay.
- [ ] Ensure the preview imports no Support247 frontend modules.
- [ ] Guard `/yullo/design/home` with `import.meta.env.DEV` so production cannot resolve it.
- [ ] Do not replace `/yullo/home` yet.

### Task 11: Visual review and handoff readiness

- [ ] Run frontend type-check and build.
- [ ] Review every fixture at mobile, tablet, and desktop widths.
- [ ] Confirm default Light colors match Section 4.
- [ ] Confirm typography and spacing match Sections 5–6.
- [ ] Confirm no card grid, glassmorphism, sidebar, chart, excessive yellow, nested card, permanent network animation, sparkle icon, or completion score exists.
- [ ] Confirm all UI interactions terminate at callbacks.
- [ ] Confirm no API, auth, backend, shared store, or Support247 integration entered this implementation.
- [ ] Record the final component props for the later integration plan.

---

## 16. Acceptance checklist

The UI design stage is complete when:

- The Home page looks intentional with zero, one, and multiple Spaces.
- It uses only the default Light palette.
- Every component is Yullo-owned and isolated.
- The page reads as an editorial operating surface rather than a dashboard.
- Attention is visually meaningful without looking alarming.
- Activity feels human and alive without becoming analytics.
- Suggested work is singular and quiet.
- Motion is finite, subtle, and disabled appropriately for reduced motion.
- Mobile is a deliberate single-column composition, not compressed desktop cards.
- Loading and error states preserve the visual system.
- The UI can be fully reviewed through local fixtures without backend availability.
- Later integration can supply data and callbacks without changing component structure or appearance.

## 17. Integration handoff contract

The later Home integration plan will provide:

- authenticated account initials and greeting name;
- validated Space display models and statuses;
- attention, activity, and suggestion display models;
- loading/error/query state;
- callbacks for retry, account, creation, Space opening/menu, attention, and suggestion actions.

The integration layer may map backend data into `YulloHomeViewProps`, but it must not move fetching, authentication, authorization, URL construction, or business rules into these presentation components.
