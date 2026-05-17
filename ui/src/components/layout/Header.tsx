import { Moon, Sun, Menu } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { StatusDot } from '../ui/StatusDot'

interface HeaderProps { title: string; subtitle?: string }

export function Header({ title, subtitle }: HeaderProps) {
  const { isDark, toggleTheme, toggleSidebar, backendStatus } = useAppStore()
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
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
          <StatusDot status={backendStatus} />
          {backendStatus === 'connected' ? 'API online' : 'API offline'}
        </div>
        <button onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-slate-300 transition-colors">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  )
}
