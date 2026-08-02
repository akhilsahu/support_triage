# 002 — Add prefers-reduced-motion CSS fallbacks

- **Status**: TODO
- **Commit**: 743dbd3
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`ui/src/index.css`)

## Problem

Keyframe animations and transition utilities in `index.css` (`.animate-fadeIn`, `.animate-stagger-1..3`, `.skeleton-shimmer`) lack explicit `@media (prefers-reduced-motion: reduce)` rules. Users who have enabled reduced motion in OS settings still experience spatial translation movement (`translateY`).

```css
/* ui/src/index.css:104 — current */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

## Target

Include `@media (prefers-reduced-motion: reduce)` in `index.css` to neutralize spatial movement while preserving gentle opacity feedback.

```css
/* target */
@media (prefers-reduced-motion: reduce) {
  .animate-fadeIn,
  .animate-stagger-1,
  .animate-stagger-2,
  .animate-stagger-3 {
    animation-name: fadeInReduced !important;
  }
  .skeleton-shimmer {
    animation: none !important;
    opacity: 0.6;
  }
}

@keyframes fadeInReduced {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

## Repo conventions to follow

- Utility classes live under `@layer utilities` in `ui/src/index.css`.

## Steps

1. Open `ui/src/index.css`.
2. Add `@keyframes fadeInReduced { from { opacity: 0; } to { opacity: 1; } }`.
3. Add `@media (prefers-reduced-motion: reduce)` block neutralizing spatial transforms for entrance animations and pausing continuous shimmer movement.

## Boundaries

- Do NOT delete existing `.animate-fadeIn` or `.skeleton-shimmer` classes.
- Do NOT remove opacity feedback for reduced-motion users.

## Verification

- **Mechanical**: Run `npm run type-check` in `ui/` directory.
- **Feel check**:
  - Open Chrome DevTools -> Rendering panel -> Emulate CSS media feature `prefers-reduced-motion: reduce`.
  - Trigger dropdown reveals and page entrances; verify element opacity transitions cleanly with zero `translateY` position movement.
- **Done when**: `prefers-reduced-motion` media block is present in `ui/src/index.css`.
