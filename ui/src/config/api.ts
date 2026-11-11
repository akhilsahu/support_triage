// All backend endpoint paths in one place — update base URL or paths here only.
// Empty string = relative URLs (Vite proxy in dev, or same-domain nginx in prod).
// Set VITE_API_URL=https://api.support247.chat when frontend is on a different domain.
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL ?? '',
  endpoints: {
    health:     '/api/v1/health',
    // RAG
    ragUpload:  '/api/v1/documents/rag/upload',
    ragPreviewDoc: '/api/v1/documents/rag/preview-doc',
    ragChat:    '/api/v1/documents/rag/chat',
    ragList:    '/api/v1/documents/rag/list',
    ragDelete:  (id: string) => `/api/v1/documents/rag/${id}`,
    // Knowledge Bases
    kbList:       '/api/v1/space/knowledge-bases',
    kbCreate:     '/api/v1/space/knowledge-bases',
    kbGet:        (id: string) => `/api/v1/space/knowledge-bases/${id}`,
    kbUpdate:     (id: string) => `/api/v1/space/knowledge-bases/${id}`,
    kbDelete:     (id: string) => `/api/v1/space/knowledge-bases/${id}`,
    kbItems:      (id: string) => `/api/v1/space/knowledge-bases/${id}/items`,
    kbItemAdd:    (id: string) => `/api/v1/space/knowledge-bases/${id}/items`,
    kbItemDelete: (kbId: string, itemId: string) => `/api/v1/space/knowledge-bases/${kbId}/items/${itemId}`,
    kbItemUpdate: (kbId: string, itemId: string) => `/api/v1/space/knowledge-bases/${kbId}/items/${itemId}`,
    // Admin KB
    adminKB:    (clientId: string) => `/api/v1/admin/clients/${clientId}/knowledge-base`,
    adminStats: '/api/v1/admin/stats',
    // Yullo Passwordless Auth & Handle Check
    yulloAuthGoogle:     '/api/v1/yullo/auth/google',
    yulloSendPhoneOtp:   '/api/v1/yullo/auth/phone/send-otp',
    yulloVerifyPhoneOtp: '/api/v1/yullo/auth/phone/verify-otp',
    yulloSendEmailOtp:   '/api/v1/yullo/auth/email/send-otp',
    yulloVerifyEmailOtp: '/api/v1/yullo/auth/email/verify-otp',
    yulloCheckHandle:    (slug: string) => `/api/v1/yullo/auth/check-handle?slug=${encodeURIComponent(slug)}`,
    // Yullo Onboarding & Summary
    yulloOnboardingDraft:   '/api/v1/yullo/onboarding/draft',
    yulloValidateHandle:    '/api/v1/yullo/onboarding/validate-handle',
    yulloReserveHandle:     '/api/v1/yullo/onboarding/reserve-handle',
    yulloSourceUrl:         '/api/v1/yullo/onboarding/sources/url',
    yulloSourceText:        '/api/v1/yullo/onboarding/sources/text',
    yulloSourceDelete:      (id: string) => `/api/v1/yullo/onboarding/sources/${id}`,
    yulloSourceUpdate:      (id: string) => `/api/v1/yullo/onboarding/sources/${id}`,
    yulloOnboardingPreview: '/api/v1/yullo/onboarding/preview',
    yulloOnboardingLaunch:  '/api/v1/yullo/onboarding/launch',
    yulloGenerateSummary:   '/api/v1/yullo/onboarding/generate-summary',
    yulloSpaceSources:      (spaceId: string) => `/api/v1/yullo/onboarding/spaces/${spaceId}/sources`,
  },
  timeout: 30000,
} as const

export const QUICK_ACTIONS = [
  { label: '📦 My Orders',      message: 'Show me my orders'          },
  { label: '🛒 Browse Products', message: 'Show me your product catalog' },
  { label: '💳 Refund Status',   message: 'What is my refund status?'  },
  { label: '🚚 Track Package',   message: 'Where is my package?'       },
  { label: '🔧 Support',         message: 'I need help with a technical issue' },
]
