import { useEffect, useState, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Bot, Database, BarChart3, Settings, ChevronLeft, ChevronDown, LogOut, Plug, Code2, Inbox, Image } from 'lucide-react'
import { IMAGES } from '../../config/images.config'
import { cn } from '../ui/cn'
import { StatusDot } from '../ui/StatusDot'
import { useAppStore } from '../../store/useAppStore'
import { NAV_ITEMS, DEFAULT_ENABLED } from '../../config/navigation'
import { apiClient } from '../../api/client'
import { API_CONFIG } from '../../config/api'
import { useInboxStream } from '../../lib/useInboxStream'
import { useDashboardTheme } from '../../config/dashboardTheme'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, MessageSquare, Bot, Database, BarChart3, Settings, Plug, Code2, Inbox, Image,
}

interface ChatbotOption {
  id: string
  slug: string
  display_name: string
  logo_url: string | null
  is_default: boolean
}

/**
 * Selects the active chatbot — Agents/Analytics/Inbox scope to it.
 * Single-bot spaces render a static label (no dropdown, nothing to switch).
 */
function ChatbotSwitcher({ collapsed, token }: { collapsed: boolean; token: string }) {
  const { currentChatbotId, setCurrentChatbotId } = useAppStore()
  const [bots, setBots] = useState<ChatbotOption[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!token) return
    apiClient.getChatbots()
      .then((data: ChatbotOption[]) => {
        setBots(data)
        // Resolve current selection: keep it if still valid, else fall back to default.
        const stillValid = data.some(b => b.id === currentChatbotId)
        if (!stillValid) {
          const def = data.find(b => b.is_default) ?? data[0]
          if (def) setCurrentChatbotId(def.id)
        }
      })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (bots.length === 0) return null

  const current = bots.find(b => b.id === currentChatbotId) ?? bots[0]
  const isMulti = bots.length > 1

  return (
    <div ref={wrapRef} className={cn('relative px-2 pb-2', collapsed && 'px-1')}>
      <button
        onClick={() => isMulti && setOpen(v => !v)}
        title={current.display_name}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-50 dark:bg-white/5 text-left transition-colors',
          isMulti && 'hover:bg-gray-100 dark:hover:bg-white/10',
          collapsed && 'justify-center px-1'
        )}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold overflow-hidden">
          {current.logo_url
            ? <img src={current.logo_url} alt="" className="w-full h-full object-cover" />
            : current.display_name.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 text-xs font-semibold text-gray-800 dark:text-white truncate">
              {current.display_name}
            </span>
            {isMulti && <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />}
          </>
        )}
      </button>

      {isMulti && open && !collapsed && (
        <div className="absolute left-2 right-2 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
          {bots.map(b => (
            <button
              key={b.id}
              onClick={() => { setCurrentChatbotId(b.id); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                b.id === current.id
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
              )}
            >
              <span className="truncate flex-1">{b.display_name}</span>
              {b.is_default && <span className="text-[10px] text-gray-400 flex-shrink-0">default</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, backendStatus, spaceName, spaceSlug, logout, token, enabledNavItems, setEnabledNavItems, unreadSessionIds } = useAppStore()
  const dt = useDashboardTheme()
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
      await fetch(`${API_CONFIG.baseURL}/api/v1/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
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
            ? dt.navActive
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

      {/* Chatbot switcher */}
      <ChatbotSwitcher collapsed={sidebarCollapsed} token={token} />

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
        {!sidebarCollapsed && spaceName && (
          <div className={`px-2 py-1.5 rounded-lg ${dt.navActive}`}>
            <p className="text-xs font-semibold truncate">{spaceName}</p>
            <p className="text-xs opacity-70 truncate">@{spaceSlug}</p>
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
