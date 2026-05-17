import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message } from '../types'

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

  // Settings
  apiKey: string
  setApiKey: (key: string) => void
  clientId: string
  setClientId: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: '',
      orgId: '',
      orgSlug: '',
      orgName: '',
      setAuth: (token, orgId, orgSlug, orgName) => set({ token, orgId, orgSlug, orgName }),
      logout: () => set({ token: '', orgId: '', orgSlug: '', orgName: '', messages: [], conversationId: undefined }),

      isDark: false,
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

      apiKey: '',
      setApiKey: (key) => set({ apiKey: key }),
      clientId: 'default',
      setClientId: (id) => set({ clientId: id }),
    }),
    {
      name: 'support247-store',
      partialize: (s) => ({ isDark: s.isDark, sidebarCollapsed: s.sidebarCollapsed, apiKey: s.apiKey, clientId: s.clientId, token: s.token, orgId: s.orgId, orgSlug: s.orgSlug, orgName: s.orgName }),
    }
  )
)
