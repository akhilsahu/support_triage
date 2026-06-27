/**
 * App-wide theme token definitions.
 *
 * Used by components that need to switch between light / dark manually
 * (e.g. pages rendered outside the main Layout that already has dark: classes).
 *
 * Tailwind's `dark:` variant handles most in-layout components automatically
 * because App.tsx adds/removes the `dark` class on <html>.
 */

export const theme = {
  /** Right-panel / form surface */
  panel: {
    bg:          { light: 'bg-white',          dark: 'bg-gray-950' },
    text:        { light: 'text-gray-900',      dark: 'text-gray-100' },
    subtext:     { light: 'text-gray-500',      dark: 'text-gray-400' },
    border:      { light: 'border-gray-200',    dark: 'border-gray-800' },
  },

  /** Tab switcher */
  tabs: {
    track:       { light: 'bg-gray-100',        dark: 'bg-gray-800' },
    active:      { light: 'bg-white text-gray-900 shadow-sm', dark: 'bg-gray-700 text-white shadow-sm' },
    inactive:    { light: 'text-gray-500 hover:text-gray-700', dark: 'text-gray-400 hover:text-gray-200' },
  },

  /** Input fields */
  input: {
    bg:          { light: 'bg-gray-50',         dark: 'bg-gray-800' },
    border:      { light: 'border-gray-200',    dark: 'border-gray-700' },
    text:        { light: 'text-gray-900',      dark: 'text-gray-100' },
    placeholder: { light: 'placeholder-gray-400', dark: 'placeholder-gray-500' },
    icon:        { light: 'text-gray-400',      dark: 'text-gray-500' },
    focusRing:   'focus:ring-indigo-500/30 focus:border-indigo-400',
  },

  /** Label */
  label:         { light: 'text-gray-500',      dark: 'text-gray-400' },

  /** Error box */
  error: {
    bg:          { light: 'bg-red-50',          dark: 'bg-red-950/40' },
    border:      { light: 'border-red-100',     dark: 'border-red-900/50' },
    text:        { light: 'text-red-600',       dark: 'text-red-400' },
  },

  /** Toggle button (theme switcher) */
  toggle: {
    bg:          { light: 'bg-gray-100 hover:bg-gray-200', dark: 'bg-gray-800 hover:bg-gray-700' },
    text:        { light: 'text-gray-600 hover:text-gray-900', dark: 'text-gray-400 hover:text-gray-100' },
  },

  /** Footer / helper text */
  footer:        { light: 'text-gray-400',      dark: 'text-gray-600' },
  link:          'text-indigo-600 dark:text-indigo-400 font-semibold hover:underline',
}

/** Helper — pick light or dark value based on `isDark` boolean */
export function t(token: { light: string; dark: string }, isDark: boolean): string {
  return isDark ? token.dark : token.light
}
