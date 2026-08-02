import { Moon, Sun, Menu, Plus, Palette, Coffee } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { useDashboardTheme } from '../../config/dashboardTheme'

type DashboardTheme = 'violet' | 'ocean' | 'sunset' | 'forest'

const THEMES: { key: DashboardTheme; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Violet',  swatch: 'bg-gradient-to-br from-violet-500 to-teal-400'   },
  { key: 'ocean',  label: 'Ocean',   swatch: 'bg-gradient-to-br from-blue-500 to-cyan-400'     },
  { key: 'sunset', label: 'Sunset',  swatch: 'bg-gradient-to-br from-orange-500 to-pink-500'   },
  { key: 'forest', label: 'Forest',  swatch: 'bg-gradient-to-br from-emerald-500 to-teal-400'  },
]

interface HeaderProps { title: string; subtitle?: string }

export function Header({ title, subtitle }: HeaderProps) {
  const { themeMode, setThemeMode, toggleSidebar, dashboardTheme, setDashboardTheme } = useAppStore()
  const dt = useDashboardTheme()
  const navigate = useNavigate()
  const [openDT, setOpenDT] = useState(false)
  const [openTM, setOpenTM] = useState(false)
  const refDT = useRef<HTMLDivElement>(null)
  const refTM = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDT && refDT.current && !refDT.current.contains(e.target as Node)) setOpenDT(false)
      if (openTM && refTM.current && !refTM.current.contains(e.target as Node)) setOpenTM(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openDT, openTM])

  const active = THEMES.find(t => t.key === dashboardTheme) ?? THEMES[0]

  return (
    <header className="relative z-10 flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 bg-white dark:bg-white/10 dark:backdrop-blur-md border-b border-gray-200 dark:border-white/10 flex-shrink-0">
      <button
        onClick={toggleSidebar}
        aria-label="Toggle navigation menu"
        className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => navigate('/app/onboarding?quick=true')}
          aria-label="Quick Create"
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold ${dt.quickCreate} text-white rounded-full min-h-[44px] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden xs:inline">Quick Create</span>
        </button>

        {/* Dashboard theme picker */}
        <div className="relative" ref={refDT}>
          <button
            onClick={() => setOpenDT(v => !v)}
            aria-label="Dashboard theme selector"
            title="Dashboard theme"
            className="min-w-[44px] min-h-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className={`w-3.5 h-3.5 rounded-full ${active.swatch} ring-1 ring-black/10`} />
            <Palette className="w-4 h-4" />
          </button>

          {openDT && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 z-50 p-2 animate-fadeIn">
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 px-3 py-1.5 block">Dashboard Theme</span>
              {THEMES.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setDashboardTheme(t.key); setOpenDT(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                    dashboardTheme === t.key
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex-shrink-0 ${t.swatch} ring-1 ring-black/10`} />
                  {t.label}
                  {dashboardTheme === t.key && <span className={`ml-auto text-[10px] font-bold ${dt.textAccent}`}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode picker */}
        <div className="relative" ref={refTM}>
          <button
            onClick={() => setOpenTM(v => !v)}
            aria-label="Appearance theme selector"
            title="Appearance"
            className="min-w-[44px] min-h-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : themeMode === 'beige' ? <Coffee className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          
          {openTM && (
            <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 z-50 p-2 animate-fadeIn">
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 px-3 py-1.5 block">Appearance</span>
              {(['light', 'dark', 'beige'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setThemeMode(m); setOpenTM(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                    themeMode === m
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {m === 'dark' ? <Moon className="w-4 h-4" /> : m === 'beige' ? <Coffee className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="capitalize">{m}</span>
                  {themeMode === m && <span className={`ml-auto text-[10px] font-bold ${dt.textAccent}`}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
