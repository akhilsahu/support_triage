// ── Typography config ─────────────────────────────────────────────────────────
// Change font or base size here — it propagates everywhere.

export const typography = {
  // Font family applied to the entire app
  fontFamily: 'Satoshi, system-ui, sans-serif',

  // Base font size in px — all rem values scale from this
  baseFontSize: 16,

  // Available size presets (user-selectable in settings)
  fontSizes: {
    sm:  14,
    md:  16,
    lg:  18,
  } as const,

  // Default size key
  defaultSize: 'md' as 'sm' | 'md' | 'lg',
}

export type FontSizeKey = keyof typeof typography.fontSizes
