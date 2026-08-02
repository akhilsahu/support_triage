# 003 — Set origin-top-right on header popover dropdowns

- **Status**: TODO
- **Commit**: 743dbd3
- **Severity**: MEDIUM
- **Category**: Physicality & Origin
- **Estimated scope**: 1 file (`ui/src/components/layout/Header.tsx`)

## Problem

Dashboard theme picker and appearance mode dropdowns in `Header.tsx` expand from their default center origin (`transform-origin: center`). In the real world, trigger-anchored menus should grow out from the trigger button that spawned them.

```tsx
/* ui/src/components/layout/Header.tsx:79 — current */
<div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 z-50 p-2 animate-fadeIn">
```

## Target

Add `origin-top-right` (`transform-origin: top right`) to the popover container so the entrance scale animation anchors directly to the trigger button's position.

```tsx
/* target */
<div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 z-50 p-2 origin-top-right animate-fadeIn">
```

## Repo conventions to follow

- Tailwind utility class `origin-top-right` sets `transform-origin: top right`.

## Steps

1. In `ui/src/components/layout/Header.tsx` at line 79 (`openDT` dropdown container), add `origin-top-right` to the className string.
2. In `ui/src/components/layout/Header.tsx` at line 111 (`openTM` dropdown container), add `origin-top-right` to the className string.

## Boundaries

- Do NOT change dropdown positioning or absolute offsets (`right-0 top-full mt-2`).
- Do NOT change z-index or shadow styles.

## Verification

- **Mechanical**: Run `npm run type-check` in `ui/`.
- **Feel check**:
  - Open Chrome DevTools Animations panel (set speed to 10%).
  - Click Theme & Appearance header icons; verify the dropdown panel scales out from the top-right trigger corner rather than expanding from its middle.
- **Done when**: Both dropdown containers in `Header.tsx` include `origin-top-right`.
