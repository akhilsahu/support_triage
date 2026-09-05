import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message } from '../types'
import { typography, type FontSizeKey } from '../config/typography'

interface AppState {
  // Auth
  token: string
  spaceId: string
  spaceSlug: string
  spaceName: string
  onboardingComplete: boolean
  setOnboardingComplete: (v: boolean) => void
  setAuth: (token: string, id: string, slug: string, name: string, onboardingComplete?: boolean) => void
  logout: () => void

  // Theme
  themeMode: 'light' | 'dark' | 'beige' | 'dark-beige'
  setThemeMode: (mode: 'light' | 'dark' | 'beige' | 'dark-beige') => void

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
  // Null means the authenticated capability bootstrap has not completed yet.
  dataSourcesEnabled: boolean | null
  setDataSourcesEnabled: (value: boolean) => void

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
  activeHomepage: 'homepage1' | 'homepage2' | 'homepage3' | 'homepage4' | 'homepage5'
  setActiveHomepage: (homepage: 'homepage1' | 'homepage2' | 'homepage3' | 'homepage4' | 'homepage5') => void

  // Factor 1 (platform-wide, super-admin) master switch for the AI homepage
  // sections renderengine -- read by ChatbotProfile to decide whether its own
  // per-bot toggle (Factor 2) is actually usable.
  homepageSectionsPlatformEnabled: boolean
  setHomepageSectionsPlatformEnabled: (enabled: boolean) => void

  // Dashboard colour theme
  dashboardTheme: 'violet' | 'ocean' | 'sunset' | 'forest'
  setDashboardTheme: (t: 'violet' | 'ocean' | 'sunset' | 'forest') => void

  // Currently selected chatbot — scopes Agents/Analytics/Inbox. Null = not
  // resolved yet (falls back to the space's default bot).
  currentChatbotId: string | null
  setCurrentChatbotId: (id: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: '',
      spaceId: '',
      spaceSlug: '',
      spaceName: '',
      onboardingComplete: false,
      setOnboardingComplete: (v) => set({ onboardingComplete: v }),
      setAuth: (token, spaceId, spaceSlug, spaceName, onboardingComplete = false) => set({ token, spaceId, spaceSlug, spaceName, onboardingComplete }),
      logout: () => set({ token: '', spaceId: '', spaceSlug: '', spaceName: '', onboardingComplete: false, messages: [], conversationId: undefined, enabledNavItems: null, dataSourcesEnabled: null, unreadSessionIds: [], activeInboxSessionId: null, inboxEvent: null, currentChatbotId: null }),

      themeMode: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
      setThemeMode: (mode) => set(() => {
        document.documentElement.classList.remove('dark', 'beige', 'dark-beige')
        if (mode === 'dark') document.documentElement.classList.add('dark')
        if (mode === 'beige') document.documentElement.classList.add('beige')
        if (mode === 'dark-beige') document.documentElement.classList.add('dark-beige')
        return { themeMode: mode }
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
      dataSourcesEnabled: null,
      setDataSourcesEnabled: (value) => set({ dataSourcesEnabled: value }),

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

      homepageSectionsPlatformEnabled: false,
      setHomepageSectionsPlatformEnabled: (enabled) => set({ homepageSectionsPlatformEnabled: enabled }),

      dashboardTheme: 'violet',
      setDashboardTheme: (t) => set({ dashboardTheme: t }),

      currentChatbotId: null,
      setCurrentChatbotId: (id) => set({ currentChatbotId: id }),
    }),
    {
      name: import.meta.env.PROD ? 'support247-store' : 'support247-store-dev',
      partialize: (s) => ({ themeMode: s.themeMode, fontSize: s.fontSize, sidebarCollapsed: s.sidebarCollapsed, apiKey: s.apiKey, clientId: s.clientId, token: s.token, spaceId: s.spaceId, spaceSlug: s.spaceSlug, spaceName: s.spaceName, onboardingComplete: s.onboardingComplete, activeHomepage: s.activeHomepage, homepageSectionsPlatformEnabled: s.homepageSectionsPlatformEnabled, dashboardTheme: s.dashboardTheme, currentChatbotId: s.currentChatbotId }),
    }
  )
)
