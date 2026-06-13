import { useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Bot, Database, BarChart3, Settings, ChevronLeft, LogOut, Plug, Code2, Inbox } from 'lucide-react'
import { IMAGES } from '../../config/images.config'
import { cn } from '../ui/cn'
import { StatusDot } from '../ui/StatusDot'
import { useAppStore } from '../../store/useAppStore'
import { NAV_ITEMS, DEFAULT_ENABLED } from '../../config/navigation'
import { apiClient } from '../../api/client'
import { useInboxStream } from '../../lib/useInboxStream'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, MessageSquare, Bot, Database, BarChart3, Settings, Plug, Code2, Inbox,
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, backendStatus, orgName, orgSlug, logout, token, enabledNavItems, setEnabledNavItems, unreadSessionIds } = useAppStore()
  const unreadCount = unreadSessionIds?.length ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const onInboxPage = location.pathname.startsWith('/app/inbox')

  // App-level inbox SSE — keeps unread notifications flowing on every page
  useInboxStream(token)

  // Fetch nav config once when logged in
  useEffect(() => {
    if (!token) return
    apiClient.getNavConfig()
      .then(data => setEnabledNavItems(data.enabled_nav_items))
      .catch(() => setEnabledNavItems(DEFAULT_ENABLED))
  }, [token])

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch { /* ignore — logout is stateless server-side */ }
    logout()
    navigate('/app/login')
  }

  const allowed = enabledNavItems ?? DEFAULT_ENABLED
  const visibleItems = NAV_ITEMS.filter(i => allowed.includes(i.id))
  const mainItems = visibleItems.filter(i => i.group === 'main')
  const advancedItems = visibleItems.filter(i => i.group === 'advanced')

  const renderLink = (item: typeof NAV_ITEMS[0]) => {
    const Icon = ICONS[item.icon]
    // Highlight Inbox when there are unread sessions and we're not already on it
    const flagUnread = item.id === 'inbox' && unreadCount > 0 && !onInboxPage
    return (
      <NavLink key={item.id} to={item.path} end={item.path === '/app/dashboard'}
        className={({ isActive }) => cn(
          'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
          isActive
            ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
            : flagUnread
            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold ring-1 ring-emerald-300 dark:ring-emerald-500/40'
            : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white',
          sidebarCollapsed && 'justify-center px-2'
        )}>
        <span className="relative flex-shrink-0">
          {Icon && <Icon className="w-4 h-4" />}
          {/* Green pulse dot on the icon when unread (visible even when collapsed) */}
          {flagUnread && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          )}
        </span>
        {!sidebarCollapsed && <span className="truncate flex-1">{item.label}</span>}
        {/* Unread count badge — only on Inbox */}
        {item.id === 'inbox' && unreadCount > 0 && (
          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold text-white rounded-full leading-none ${flagUnread ? 'bg-emerald-500' : 'bg-red-500'} ${sidebarCollapsed ? 'absolute top-1 right-1' : ''}`}>
            {unreadCount}
          </span>
        )}
      </NavLink>
    )
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
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {/* Main group */}
        {mainItems.map(renderLink)}

        {/* Advanced group — only show if there are visible advanced items */}
        {advancedItems.length > 0 && (
          <>
            <div className="pt-3 pb-1">
              {!sidebarCollapsed
                ? <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Advanced</p>
                : <div className="border-t border-gray-200 dark:border-white/10 mx-2" />
              }
            </div>
            {advancedItems.map(renderLink)}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-gray-200 dark:border-white/10 space-y-2">
        {!sidebarCollapsed && orgName && (
          <div className="px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate">{orgName}</p>
            <p className="text-xs text-indigo-400 truncate">@{orgSlug}</p>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5">
            <StatusDot status={backendStatus} />
            <span className="text-xs text-gray-500 dark:text-slate-400 truncate">
              {backendStatus === 'connected' ? 'Backend online' : backendStatus === 'disconnected' ? 'Backend offline' : 'Connecting…'}
            </span>
          </div>
        )}

        <button onClick={handleLogout}
          className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 transition-colors', sidebarCollapsed && 'justify-center')}
          title="Sign out">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && 'Sign out'}
        </button>

        <button onClick={toggleSidebar}
          className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors', sidebarCollapsed && 'justify-center')}>
          <ChevronLeft className={cn('w-4 h-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}
