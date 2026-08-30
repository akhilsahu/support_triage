// Navigation items for sidebar — adding a new screen only requires adding an entry here.
export interface NavItem {
  id: string
  label: string
  icon: string
  path: string
  group: 'main' | 'advanced'
  badge?: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',      icon: 'LayoutDashboard', path: '/app/dashboard',     group: 'main' },
  { id: 'agents',        label: 'Agents',          icon: 'Bot',             path: '/app/agents',        group: 'main' },
  { id: 'knowledge-base',label: 'Knowledge Base',  icon: 'Database',        path: '/app/knowledge-base',group: 'main' },
  { id: 'analytics',     label: 'Analytics',       icon: 'BarChart3',       path: '/app/analytics',     group: 'main' },
  { id: 'evaluations',   label: 'Evaluations',     icon: 'ClipboardCheck',  path: '/app/evaluations',   group: 'main' },
  { id: 'inbox',         label: 'Inbox',           icon: 'Inbox',           path: '/app/inbox',         group: 'main' },
  { id: 'embed-widget',  label: 'Embed Widget',    icon: 'Code2',           path: '/app/embed-widget',  group: 'advanced' },
  { id: 'chatbot-ui',      label: 'Chatbot UI',      icon: 'LayoutTemplate', path: '/app/chatbot-ui',      group: 'advanced' },
  { id: 'chatbot-profile', label: 'Chatbot Profile', icon: 'Image',         path: '/app/chatbot-profile', group: 'advanced' },
  { id: 'data-sources',  label: 'Data Sources',    icon: 'Database',        path: '/app/data-sources',  group: 'advanced' },
  { id: 'integrations',  label: 'Integrations',    icon: 'Plug',            path: '/app/integrations',  group: 'advanced' },
  { id: 'settings',      label: 'Settings',        icon: 'Settings',        path: '/app/settings',      group: 'advanced' },
]

// Default enabled items when nav-config hasn't loaded yet
export const DEFAULT_ENABLED = NAV_ITEMS.map(i => i.id)
