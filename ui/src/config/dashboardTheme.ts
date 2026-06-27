import { useAppStore } from '../store/useAppStore'

export type DashboardTheme = 'violet' | 'ocean' | 'sunset' | 'forest'

export const DASH_THEME = {
  violet: {
    navActive:   'bg-violet-50 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
    primaryBtn:  'bg-violet-600 hover:bg-violet-700 text-white shadow-sm',
    quickCreate: 'bg-violet-600 hover:bg-violet-700',
    textAccent:  'text-violet-600 dark:text-violet-400',
    hoverAccent: 'hover:text-violet-800 dark:hover:text-violet-300',
    borderAccent:'border-violet-100 dark:border-violet-500/20',
  },
  ocean: {
    navActive:   'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
    primaryBtn:  'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    quickCreate: 'bg-blue-600 hover:bg-blue-700',
    textAccent:  'text-blue-600 dark:text-blue-400',
    hoverAccent: 'hover:text-blue-800 dark:hover:text-blue-300',
    borderAccent:'border-blue-100 dark:border-blue-500/20',
  },
  sunset: {
    navActive:   'bg-orange-50 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300',
    primaryBtn:  'bg-orange-500 hover:bg-orange-600 text-white shadow-sm',
    quickCreate: 'bg-orange-500 hover:bg-orange-600',
    textAccent:  'text-orange-600 dark:text-orange-400',
    hoverAccent: 'hover:text-orange-800 dark:hover:text-orange-300',
    borderAccent:'border-orange-100 dark:border-orange-500/20',
  },
  forest: {
    navActive:   'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    primaryBtn:  'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    quickCreate: 'bg-emerald-600 hover:bg-emerald-700',
    textAccent:  'text-emerald-600 dark:text-emerald-400',
    hoverAccent: 'hover:text-emerald-800 dark:hover:text-emerald-300',
    borderAccent:'border-emerald-100 dark:border-emerald-500/20',
  },
} as const

export function useDashboardTheme() {
  const t = useAppStore(s => s.dashboardTheme)
  return DASH_THEME[t ?? 'violet']
}
