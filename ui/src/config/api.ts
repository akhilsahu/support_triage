// All backend endpoint paths in one place — update base URL or paths here only.
const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export const API_CONFIG = {
  baseURL: BASE,
  endpoints: {
    health:     '/health',
    chat:       '/api/v1/chat',
    agents:     '/api/v1/agents/status',
    sentiment:  '/api/v1/empathy/analyze',
    // RAG
    ragUpload:  '/api/v1/documents/rag/upload',
    ragChat:    '/api/v1/documents/rag/chat',
    ragList:    '/api/v1/documents/rag/list',
    ragDelete:  (id: string) => `/api/v1/documents/rag/${id}`,
    ragClient:  (clientId: string) => `/api/v1/documents/rag/client/${clientId}`,
    // Admin KB
    adminKB:    (clientId: string) => `/api/v1/admin/clients/${clientId}/knowledge-base`,
    adminStats: '/api/v1/admin/stats',
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
