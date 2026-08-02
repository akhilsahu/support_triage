# 004 — Implement iOS-style slide transition for ChatHistoryDrawer

- **Status**: TODO
- **Commit**: 743dbd3
- **Severity**: MEDIUM
- **Category**: Missed Opportunities & Physicality
- **Estimated scope**: 1 file (`ui/src/components/chat/ChatHistoryDrawer.tsx`)

## Problem

The customer past-conversations side drawer currently snaps into view instantly when opened, breaking spatial continuity and leaving no visual connection to where the sheet came from.

```tsx
/* ui/src/components/chat/ChatHistoryDrawer.tsx:99 — current */
<aside className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm border-r shadow-2xl flex flex-col ${panelCls}`}>
```

## Target

Implement an iOS-style drawer slide transition using CSS `@starting-style` or dynamic translation classes, entering from `translateX(-100%)` to `translateX(0)` over 280ms with an Apple drawer cubic-bezier curve `cubic-bezier(0.32, 0.72, 0, 1)`.

```tsx
/* target */
<aside className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm border-r shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${panelCls}`}>
```

## Repo conventions to follow

- Easing curve: `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-like drawer curve).
- Backdrop scrim uses `transition-opacity duration-200`.

## Steps

1. In `ui/src/components/chat/ChatHistoryDrawer.tsx`, wrap the drawer in an animation container or add CSS transition classes to smoothly interpolate `transform` on open/close state change.
2. Add `@starting-style` or mounted animation state so opening the drawer triggers a fluid `translateX(-100%)` -> `translateX(0)` entry.
3. Ensure backdrop scrim fades in softly via `opacity` transition.

## Boundaries

- Do NOT alter drawer content, deletion flows, or backend data calls.
- Respect `prefers-reduced-motion` by falling back to a pure opacity fade for users with reduced motion enabled.

## Verification

- **Mechanical**: Run `npm run type-check` in `ui/`.
- **Feel check**:
  - Click "Past conversations" button in customer chat header.
  - Verify side sheet slides smoothly from the left screen edge.
  - Close drawer; verify sheet slides out to the left edge cleanly.
- **Done when**: Drawer slides smoothly from left edge without layout popping.
