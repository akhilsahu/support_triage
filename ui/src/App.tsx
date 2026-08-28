import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { API_CONFIG } from './config/api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './screens/Dashboard'
import { DynamicHome, DynamicLogin, DynamicHowItWorks, DynamicPricing } from './screens/home/ThemeSwitcher'
import { Chat } from './screens/Chat'
import { Agents } from './screens/Agents'
import { KnowledgeBase } from './screens/KnowledgeBase'
import { Analytics } from './screens/Analytics'
import { Settings } from './screens/Settings'
import { NotFound } from './screens/NotFound'
import { SuperAdmin } from './screens/SuperAdmin'
import { DataSourceSetup } from './screens/DataSourceSetup'
import { CustomerChat } from './screens/CustomerChat'
import { Inbox } from './screens/Inbox'
import { TestChat } from './screens/TestChat'
import { EmbedWidget } from './screens/EmbedWidget'
import { ChatbotProfile } from './screens/ChatbotProfile'
import { OnboardingWizard } from './screens/OnboardingWizard'
import { ForgotPassword } from './screens/ForgotPassword'
import { ResetPassword } from './screens/ResetPassword'
import { VerifyEmail } from './screens/VerifyEmail'
import {
  AboutPage, WhatWeDoPage, FeaturesPage,
  PrivacyPage, TermsPage, CookiesPage, ContactPage, SecurityPage,
} from './screens/StaticPage'
import { useAppStore } from './store/useAppStore'

import { apiClient } from './api/client'
import { RouteSeo } from './lib/RouteSeo'
import { CopilotChatPage } from './screens/CopilotChatPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, onboardingComplete } = useAppStore()
  if (!token) return <Navigate to="/app/login" replace />
  if (!onboardingComplete) return <Navigate to="/app/onboarding" replace />
  return <>{children}</>
}

// Back-compat: old /s/:slug links redirect to the new root /:slug (query preserved)
function LegacyChatRedirect() {
  const { slug } = useParams<{ slug: string }>()
  const { search } = useLocation()
  return <Navigate to={`/${slug ?? ''}${search}`} replace />
}

export default function App() {
  const { themeMode, fontSize, setBackendStatus, setActiveHomepage, setHomepageSectionsPlatformEnabled, dashboardTheme } = useAppStore()

  // Fetch active homepage on mount
  useEffect(() => {
    fetch(`${API_CONFIG.baseURL}/api/v1/super-admin/settings/public`)
      .then(r => r.json())
      .then(d => {
        if (d.active_homepage) {
          setActiveHomepage(d.active_homepage)
        }
        setHomepageSectionsPlatformEnabled(!!d.homepage_sections_platform_enabled)
      })
      .catch(() => { })
  }, [setActiveHomepage, setHomepageSectionsPlatformEnabled])

  // Restore theme mode class on mount
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'beige', 'dark-beige')
    if (themeMode === 'dark') document.documentElement.classList.add('dark')
    if (themeMode === 'beige') document.documentElement.classList.add('beige')
    if (themeMode === 'dark-beige') document.documentElement.classList.add('dark-beige')
  }, [themeMode])

  // Apply dashboard theme accent color
  useEffect(() => {
    document.documentElement.setAttribute('data-dashboard-theme', dashboardTheme || 'violet')
  }, [dashboardTheme])

  // Apply persisted font size on mount
  useEffect(() => {
    import('./config/typography').then(({ typography }) => {
      document.documentElement.style.fontSize = `${typography.fontSizes[fontSize]}px`
    })
  }, [fontSize])

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
        <RouteSeo />
        <Routes>
          {/* ── Marketing / landing (root namespace, reserved) ── */}
          <Route path="/" element={<DynamicHome />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/what-we-do" element={<WhatWeDoPage />} />
          <Route path="/how-it-works" element={<DynamicHowItWorks />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<DynamicPricing />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/security" element={<SecurityPage />} />

          {/* ── App (authenticated product) under /app/* ── */}
          <Route path="/app/onboarding" element={<OnboardingWizard />} />
          <Route path="/app/login" element={<DynamicLogin />} />
          <Route path="/app/forgot-password" element={<ForgotPassword />} />
          <Route path="/app/reset-password" element={<ResetPassword />} />
          <Route path="/app/verify-email" element={<VerifyEmail />} />
          <Route path="/app/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
          <Route path="/app/chat" element={<PrivateRoute><Layout><Chat /></Layout></PrivateRoute>} />
          <Route path="/app/agents" element={<PrivateRoute><Layout><Agents /></Layout></PrivateRoute>} />
          <Route path="/app/agents/datasource" element={<PrivateRoute><DataSourceSetup /></PrivateRoute>} />
          <Route path="/app/agents/test" element={<PrivateRoute><Layout><TestChat /></Layout></PrivateRoute>} />
          <Route path="/app/data-sources" element={<PrivateRoute><Layout><DataSourceSetup /></Layout></PrivateRoute>} />
          <Route path="/app/inbox" element={<PrivateRoute><Layout><Inbox /></Layout></PrivateRoute>} />
          <Route path="/app/knowledge-base" element={<PrivateRoute><Layout><KnowledgeBase /></Layout></PrivateRoute>} />
          <Route path="/app/analytics" element={<PrivateRoute><Layout><Analytics /></Layout></PrivateRoute>} />
          <Route path="/app/settings" element={<PrivateRoute><Layout><Settings /></Layout></PrivateRoute>} />
          <Route path="/app/embed-widget" element={<PrivateRoute><Layout><EmbedWidget /></Layout></PrivateRoute>} />
          <Route path="/app/chatbot-ui" element={<PrivateRoute><Layout><ChatbotProfile view="ui" /></Layout></PrivateRoute>} />
          <Route path="/app/chatbot-profile" element={<PrivateRoute><Layout><ChatbotProfile view="branding" /></Layout></PrivateRoute>} />
          <Route path="/app/super-admin" element={<SuperAdmin />} />
          {/* Bare /app → dashboard */}
          <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />

          {/* ── Back-compat: old /s/:slug → /:slug ── */}
          <Route path="/s/:slug" element={<LegacyChatRedirect />} />

          {/* ── Customer chat lives at the root namespace: /<slug> (default bot)
                 and /<slug>/<chatbotSlug> for a specific bot. Registered after all
                 static marketing routes so those win the match. ── */}
          <Route path="/copil/:slug" element={<CopilotChatPage />} />
          <Route 
            path="/:slug" 
            element={import.meta.env.VITE_ENABLE_COPILOT_UI === 'true' ? <CopilotChatPage /> : <CustomerChat />} 
          />
          <Route 
            path="/:slug/:chatbotSlug" 
            element={import.meta.env.VITE_ENABLE_COPILOT_UI === 'true' ? <CopilotChatPage /> : <CustomerChat />} 
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
