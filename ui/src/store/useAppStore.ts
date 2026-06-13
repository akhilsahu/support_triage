import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message } from '../types'
import { typography, type FontSizeKey } from '../config/typography'

interface AppState {
  // Auth
  token: string
  orgId: string
  orgSlug: string
  orgName: string
  setAuth: (token: string, id: string, slug: string, name: string) => void
  logout: () => void

  // Theme
  isDark: boolean
  toggleTheme: () => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Chat
  messages: Message[]
  conversationId: string | undefined
  addMessage: (msg: Message) => void
  setConversationId: (id: string) => void
  clearChat: () => void

  // Active agent
  activeAgent: string
  setActiveAgent: (agent: string) => void

  // Backend
  backendStatus: 'connected' | 'disconnected' | 'checking'
  setBackendStatus: (s: 'connected' | 'disconnected' | 'checking') => void

  // Font size
  fontSize: FontSizeKey
  setFontSize: (size: FontSizeKey) => void

  // Nav config
  enabledNavItems: string[] | null
  setEnabledNavItems: (items: string[]) => void

  // Settings
  apiKey: string
  setApiKey: (key: string) => void
  clientId: string
  setClientId: (id: string) => void

  // Unread inbox sessions (not persisted — resets on reload)
  unreadSessionIds: string[]
  addUnreadSession: (id: string) => void
  clearUnreadSession: (id: string) => void

  // Which inbox session is currently open on screen (null = none / not on Inbox)
  activeInboxSessionId: string | null
  setActiveInboxSession: (id: string | null) => void

  // Last SSE event from the app-level inbox stream — seq-stamped so the
  // Inbox screen can react to each new event even if the payload repeats.
  inboxEvent: { type: string; data: string; seq: number } | null
  dispatchInboxEvent: (type: string, data: string) => void

  // Active Homepage Layout
  activeHomepage: 'homepage1' | 'homepage2' | 'homepage3'
  setActiveHomepage: (homepage: 'homepage1' | 'homepage2' | 'homepage3') => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: '',
      orgId: '',
      orgSlug: '',
      orgName: '',
      setAuth: (token, orgId, orgSlug, orgName) => set({ token, orgId, orgSlug, orgName }),
      logout: () => set({ token: '', orgId: '', orgSlug: '', orgName: '', messages: [], conversationId: undefined, enabledNavItems: null, unreadSessionIds: [], activeInboxSessionId: null, inboxEvent: null }),

      isDark: typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
      toggleTheme: () => set((s) => {
        const next = !s.isDark
        if (next) document.documentElement.classList.add('dark')
        else document.documentElement.classList.remove('dark')
        return { isDark: next }
      }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      messages: [],
      conversationId: undefined,
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      setConversationId: (id) => set({ conversationId: id }),
      clearChat: () => set({ messages: [], conversationId: undefined }),

      activeAgent: 'Triage Agent',
      setActiveAgent: (agent) => set({ activeAgent: agent }),

      backendStatus: 'checking',
      setBackendStatus: (s) => set({ backendStatus: s }),

      fontSize: typography.defaultSize,
      setFontSize: (size) => set(() => {
        document.documentElement.style.fontSize = `${typography.fontSizes[size]}px`
        return { fontSize: size }
      }),

      enabledNavItems: null,
      setEnabledNavItems: (items) => set({ enabledNavItems: items }),

      apiKey: '',
      setApiKey: (key) => set({ apiKey: key }),
      clientId: 'default',
      setClientId: (id) => set({ clientId: id }),

      unreadSessionIds: [],
      addUnreadSession: (id) => set(s => ({
        unreadSessionIds: s.unreadSessionIds.includes(id) ? s.unreadSessionIds : [...s.unreadSessionIds, id],
      })),
      clearUnreadSession: (id) => set(s => ({
        unreadSessionIds: s.unreadSessionIds.filter(x => x !== id),
      })),

      activeInboxSessionId: null,
      setActiveInboxSession: (id) => set({ activeInboxSessionId: id }),

      inboxEvent: null,
      dispatchInboxEvent: (type, data) => set(s => ({
        inboxEvent: { type, data, seq: (s.inboxEvent?.seq ?? 0) + 1 },
      })),

      activeHomepage: 'homepage1',
      setActiveHomepage: (homepage) => set({ activeHomepage: homepage }),
    }),
    {
      name: 'support247-store',
      partialize: (s) => ({ isDark: s.isDark, fontSize: s.fontSize, sidebarCollapsed: s.sidebarCollapsed, apiKey: s.apiKey, clientId: s.clientId, token: s.token, orgId: s.orgId, orgSlug: s.orgSlug, orgName: s.orgName, activeHomepage: s.activeHomepage }),
    }
  )
)
