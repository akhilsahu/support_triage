import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './screens/Dashboard'
import { Home } from './screens/Home'
import { Chat } from './screens/Chat'
import { Agents } from './screens/Agents'
import { KnowledgeBase } from './screens/KnowledgeBase'
import { Analytics } from './screens/Analytics'
import { Settings } from './screens/Settings'
import { Login } from './screens/Login'
import { NotFound } from './screens/NotFound'
import { SuperAdmin } from './screens/SuperAdmin'
import { DataSourceSetup } from './screens/DataSourceSetup'
import { CustomerChat } from './screens/CustomerChat'
import {
  AboutPage, WhatWeDoPage, HowItWorksPage, FeaturesPage,
  PrivacyPage, TermsPage, CookiesPage, ContactPage, SecurityPage,
} from './screens/StaticPage'
import { Pricing } from './screens/Pricing'
import { useAppStore } from './store/useAppStore'
import { apiClient } from './api/client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAppStore()
  return token ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  const { isDark, setBackendStatus } = useAppStore()

  // Restore dark mode class on mount
  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [isDark])

  // Poll backend health
  useEffect(() => {
    const check = async () => {
      try { await apiClient.healthCheck(); setBackendStatus('connected') }
      catch { setBackendStatus('disconnected') }
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [setBackendStatus])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<PrivateRoute><Layout title="Dashboard" subtitle="SUPPORT247.chat overview"><Dashboard /></Layout></PrivateRoute>} />
          <Route path="/chat" element={<PrivateRoute><Layout title="Chat" subtitle="AI-powered customer support"><Chat /></Layout></PrivateRoute>} />
          <Route path="/agents" element={<PrivateRoute><Layout title="Agents" subtitle="Manage your AI agent fleet"><Agents /></Layout></PrivateRoute>} />
          <Route path="/agents/datasource" element={<PrivateRoute><DataSourceSetup /></PrivateRoute>} />
          <Route path="/knowledge-base" element={<PrivateRoute><Layout title="Knowledge Docs" subtitle="Upload and manage your agent knowledge base"><KnowledgeBase /></Layout></PrivateRoute>} />
          <Route path="/analytics" element={<PrivateRoute><Layout title="Analytics" subtitle="Usage insights and performance"><Analytics /></Layout></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Layout title="Settings" subtitle="Configure SUPPORT247.chat"><Settings /></Layout></PrivateRoute>} />
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/s/:slug" element={<CustomerChat />} />

          {/* Static / marketing pages */}
          <Route path="/about"         element={<AboutPage />} />
          <Route path="/what-we-do"    element={<WhatWeDoPage />} />
          <Route path="/how-it-works"  element={<HowItWorksPage />} />
          <Route path="/features"      element={<FeaturesPage />} />
          <Route path="/pricing"       element={<Pricing />} />
          <Route path="/privacy"       element={<PrivacyPage />} />
          <Route path="/terms"         element={<TermsPage />} />
          <Route path="/cookies"       element={<CookiesPage />} />
          <Route path="/contact"       element={<ContactPage />} />
          <Route path="/security"      element={<SecurityPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
