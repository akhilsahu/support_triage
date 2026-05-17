// Navigation items for sidebar — adding a new screen only requires adding an entry here.
export interface NavItem {
  id: string
  label: string
  icon: string
  path: string
  badge?: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',      label: 'Dashboard',        icon: 'LayoutDashboard', path: '/dashboard'    },
  { id: 'chat',           label: 'Chat',             icon: 'MessageSquare',   path: '/chat'         },
  { id: 'agents',         label: 'Agents',           icon: 'Bot',             path: '/agents'       },
  { id: 'knowledge-base', label: 'Knowledge Docs',   icon: 'Database',        path: '/knowledge-base' },
  { id: 'analytics',      label: 'Analytics',        icon: 'BarChart3',       path: '/analytics'    },
  { id: 'settings',       label: 'Settings',         icon: 'Settings',        path: '/settings'     },
]
