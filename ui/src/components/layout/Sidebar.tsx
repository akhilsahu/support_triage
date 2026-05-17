import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Bot, Database, BarChart3, Settings, ChevronLeft, LogOut } from 'lucide-react'
import { IMAGES } from '../../config/images.config'
import { cn } from '../ui/cn'
import { StatusDot } from '../ui/StatusDot'
import { useAppStore } from '../../store/useAppStore'
import { NAV_ITEMS } from '../../config/navigation'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, MessageSquare, Bot, Database, BarChart3, Settings,
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, backendStatus, orgName, orgSlug, logout } = useAppStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <aside className={cn(
      'flex flex-col bg-white dark:bg-white/10 dark:backdrop-blur-md border-r border-gray-200 dark:border-white/10 transition-all duration-300 flex-shrink-0 h-full',
      sidebarCollapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center gap-3 p-4 border-b border-white/10', sidebarCollapsed && 'justify-center')}>
        <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 shadow-md shadow-violet-500/20" />
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">SUPPORT247.chat</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">AI Multi-Agent</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const Icon = ICONS[item.icon]
          return (
            <NavLink key={item.id} to={item.path} end={item.path === '/dashboard'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white',
                sidebarCollapsed && 'justify-center px-2'
              )}>
              {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom: brand info, status, logout, collapse */}
      <div className="p-3 border-t border-gray-200 dark:border-white/10 space-y-2">
        {/* Org identity */}
        {!sidebarCollapsed && orgName && (
          <div className="px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate">{orgName}</p>
            <p className="text-xs text-indigo-400 truncate">@{orgSlug}</p>
          </div>
        )}

        {/* Backend status */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5">
            <StatusDot status={backendStatus} />
            <span className="text-xs text-gray-500 dark:text-slate-400 truncate">
              {backendStatus === 'connected' ? 'Backend online' : backendStatus === 'disconnected' ? 'Backend offline' : 'Connecting…'}
            </span>
          </div>
        )}

        {/* Logout */}
        <button onClick={handleLogout}
          className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 transition-colors', sidebarCollapsed && 'justify-center')}
          title="Sign out">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && 'Sign out'}
        </button>

        {/* Collapse */}
        <button onClick={toggleSidebar}
          className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors', sidebarCollapsed && 'justify-center')}>
          <ChevronLeft className={cn('w-4 h-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}
