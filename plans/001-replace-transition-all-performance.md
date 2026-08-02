# 001 — Replace transition: all with targeted GPU properties

- **Status**: TODO
- **Commit**: 743dbd3
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 3 files (`Sidebar.tsx`, `Button.tsx`, `Header.tsx`)

## Problem

Generic `transition: all` is used on high-frequency interactive elements (navigation links, buttons, theme controls). This forces the browser to evaluate off-GPU properties (layout geometry, background-color, border, font-size) during state changes, causing dropped frames on complex pages.

```tsx
/* ui/src/components/layout/Sidebar.tsx:156 */
className={({ isActive }) => cn(
  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
  ...
)}
```

## Target

Replace `transition-all` with targeted CSS property transitions (`transition-colors` or `transition-[transform,opacity]`) to ensure GPU compositing and zero layout thrashing.

```tsx
/* target */
className={({ isActive }) => cn(
  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 group',
  ...
)}
```

## Repo conventions to follow

- Tailwind CSS utility classes are used for transition properties: `transition-colors`, `transition-transform`, `transition-opacity`.
- Exemplar: `Header.tsx:45` uses `transition-colors`.

## Steps

1. In `ui/src/components/layout/Sidebar.tsx` at line 156, replace `transition-all` with `transition-colors`.
2. In `ui/src/components/ui/Button.tsx` at line 22, replace `transition-all` with `transition-[transform,opacity,background-color,border-color,box-shadow]`.
3. In `ui/src/components/layout/Header.tsx` at line 56, replace `transition-all` with `transition-[transform,background-color]`.

## Boundaries

- Do NOT change component layout or markup.
- Do NOT remove hover or active state styles.

## Verification

- **Mechanical**: Run `npm run type-check` in `ui/` directory — expected exit code 0.
- **Feel check**:
  - Hover rapidly over sidebar navigation links; confirm smooth background transitions with zero main-thread layout recalculations in DevTools Performance panel.
  - Press primary CTA buttons; confirm active scale response remains hardware-accelerated.
- **Done when**: `grep -rn "transition-all" ui/src/components/layout` returns 0 matches.
