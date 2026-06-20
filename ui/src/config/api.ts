// All backend endpoint paths in one place — update base URL or paths here only.
// Empty string = relative URLs, routed via Netlify proxy (prod) or Vite proxy (dev).
export const API_CONFIG = {
  baseURL: '',
  endpoints: {
    health:     '/api/v1/health',
    chat:       '/api/v1/chat',
    agents:     '/api/v1/agents/status',
    sentiment:  '/api/v1/empathy/analyze',
    // RAG
    ragUpload:  '/api/v1/documents/rag/upload',
    ragChat:    '/api/v1/documents/rag/chat',
    ragList:    '/api/v1/documents/rag/list',
    ragDelete:  (id: string) => `/api/v1/documents/rag/${id}`,
    ragClient:  (clientId: string) => `/api/v1/documents/rag/client/${clientId}`,
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
