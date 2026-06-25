import { Moon, Sun, Menu, Plus, Palette } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { StatusDot } from '../ui/StatusDot'

type DashboardTheme = 'violet' | 'ocean' | 'sunset' | 'forest'

const THEMES: { key: DashboardTheme; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Violet',  swatch: 'bg-gradient-to-br from-violet-500 to-teal-400'   },
  { key: 'ocean',  label: 'Ocean',   swatch: 'bg-gradient-to-br from-blue-500 to-cyan-400'     },
  { key: 'sunset', label: 'Sunset',  swatch: 'bg-gradient-to-br from-orange-500 to-pink-500'   },
  { key: 'forest', label: 'Forest',  swatch: 'bg-gradient-to-br from-emerald-500 to-teal-400'  },
]

interface HeaderProps { title: string; subtitle?: string }

export function Header({ title, subtitle }: HeaderProps) {
  const { isDark, toggleTheme, toggleSidebar, backendStatus, dashboardTheme, setDashboardTheme } = useAppStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const active = THEMES.find(t => t.key === dashboardTheme) ?? THEMES[0]

  return (
    <header className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-white/10 dark:backdrop-blur-md border-b border-gray-200 dark:border-white/10 flex-shrink-0">
      <button onClick={toggleSidebar} className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300">
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/app/onboarding?quick=true')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Quick Create
        </button>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
          <StatusDot status={backendStatus} />
          {backendStatus === 'connected' ? 'API online' : 'API offline'}
        </div>

        {/* Dashboard theme picker */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(v => !v)}
            title="Dashboard theme"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300 transition-colors flex items-center gap-1.5"
          >
            <span className={`w-3.5 h-3.5 rounded-full ${active.swatch} ring-1 ring-black/10`} />
            <Palette className="w-4 h-4" />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/10 z-50 p-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 pb-1.5">Dashboard theme</p>
              {THEMES.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setDashboardTheme(t.key); setOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    dashboardTheme === t.key
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex-shrink-0 ${t.swatch} ring-1 ring-black/10`} />
                  {t.label}
                  {dashboardTheme === t.key && <span className="ml-auto text-[10px] font-bold text-indigo-500">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300 transition-colors">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  )
}
