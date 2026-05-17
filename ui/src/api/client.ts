import axios from 'axios'
import { API_CONFIG } from '../config/api'

const http = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token from Zustand store on every request
http.interceptors.request.use(config => {
  try {
    const stored = localStorage.getItem('support247-store')
    if (stored) {
      const parsed = JSON.parse(stored)
      const token = parsed?.state?.token
      if (token) config.headers['Authorization'] = `Bearer ${token}`
    }
  } catch { /* ignore */ }
  return config
})

export const apiClient = {
  healthCheck: () => http.get(API_CONFIG.endpoints.health).then(r => r.data),

  sendMessage: (message: string, conversationId?: string, orgId?: string) =>
    http.post(API_CONFIG.endpoints.chat, { message, conversation_id: conversationId, org_id: orgId }).then(r => r.data),

  getAgentStatus: () =>
    http.get(API_CONFIG.endpoints.agents).then(r => r.data),

  analyzeSentiment: (message: string) =>
    http.post(API_CONFIG.endpoints.sentiment, { message }).then(r => r.data),

  // RAG
  uploadDoc: (file: File, clientId?: string, docType?: string, kbName?: string, kbDescription?: string, expiryDate?: string) => {
    const form = new FormData()
    form.append('file', file)
    return http.post(API_CONFIG.endpoints.ragUpload, form, {
      headers: {
        'Content-Type': undefined,   // let axios set multipart boundary automatically
        ...(clientId      ? { 'X-Client-Id':      clientId      } : {}),
        ...(docType       ? { 'X-Doc-Type':        docType       } : {}),
        ...(kbName        ? { 'X-KB-Name':         kbName        } : {}),
        ...(kbDescription ? { 'X-KB-Description':  kbDescription } : {}),
        ...(expiryDate    ? { 'X-KB-Expiry':       expiryDate    } : {}),
      },
    }).then(r => r.data)
  },

  listDocs: () =>
    http.get(API_CONFIG.endpoints.ragList).then(r => r.data),

  deleteDoc: (docId: string) =>
    http.delete(API_CONFIG.endpoints.ragDelete(docId)).then(r => r.data),

  chatWithDoc: (docId: string, question: string, topK = 5) =>
    http.post(API_CONFIG.endpoints.ragChat, { doc_id: docId, question, top_k: topK }).then(r => r.data),

  chatWithClientKB: (clientId: string, question: string, docId?: string) =>
    http.post(API_CONFIG.endpoints.ragClient(clientId), { client_id: clientId, question, doc_id: docId }).then(r => r.data),

  getAdminStats: () =>
    http.get(API_CONFIG.endpoints.adminStats).then(r => r.data),

  // Data Sources
  probeDataSource: (payload: {
    api_url: string; method?: string; auth_type?: string; auth_value?: string;
    auth_header?: string; request_headers?: object; request_params?: object; request_body?: object
  }) => http.post('/api/v1/datasources/probe', payload).then(r => r.data),

  listDataSources: () =>
    http.get('/api/v1/datasources/').then(r => r.data),

  createDataSource: (payload: object) =>
    http.post('/api/v1/datasources/', payload).then(r => r.data),

  updateDataSource: (id: string, payload: object) =>
    http.put(`/api/v1/datasources/${id}`, payload).then(r => r.data),

  deleteDataSource: (id: string) =>
    http.delete(`/api/v1/datasources/${id}`).then(r => r.data),

  // Org Knowledge Base
  getDocChunks: (docId: string) =>
    http.get(`/api/v1/org/kb/${docId}/chunks`).then(r => r.data),

  // Dashboard Stats
  getDashboardStats: () =>
    http.get('/api/v1/dashboard/stats').then(r => r.data),

  // Org Profile
  getProfile: () =>
    http.get('/api/v1/dashboard/profile').then(r => r.data),

  updateProfile: (payload: { display_name?: string; logo_url?: string; theme_color?: string; show_rag_citations?: boolean }) =>
    http.patch('/api/v1/dashboard/profile', payload).then(r => r.data),

  // Org Doc Types (distinct types from org's ChromaDB partition)
  listOrgDocTypes: () =>
    http.get('/api/v1/dashboard/doc-types').then(r => r.data),

  // Agent Meta Suggestions
  generateAgentSuggestion: (doc_types: string[], doc_id?: string, force?: boolean) =>
    http.post('/api/v1/dashboard/agent-suggestions', { doc_types, doc_id: doc_id ?? null, force: force ?? false }).then(r => r.data),

  linkSuggestionToAgent: (suggestion_id: string, agent_id: string) =>
    http.patch('/api/v1/dashboard/agent-suggestions/link', { suggestion_id, agent_id }).then(r => r.data),

  // Org Agents
  listOrgAgents: () =>
    http.get('/api/v1/org/agents').then(r => r.data),

  createOrgAgent: (payload: {
    name: string; description?: string; icon?: string; system_prompt?: string;
    temperature?: number; max_tokens?: number; rag_enabled?: boolean;
    rag_doc_types?: string[]; rag_top_k?: number; keywords?: string[];
    doc_ids?: string[]
  }) => http.post('/api/v1/org/agents', payload).then(r => r.data),

  updateOrgAgent: (id: string, payload: {
    system_prompt?: string
    temperature?: number
    max_tokens?: number
    active?: boolean
    keywords?: string[]
    rag_enabled?: boolean
    rag_doc_types?: string[]
    rag_top_k?: number
    doc_ids?: string[]
  }) => http.patch(`/api/v1/org/agents/${id}`, payload).then(r => r.data),

  deleteOrgAgent: (id: string) =>
    http.delete(`/api/v1/org/agents/${id}`).then(r => r.data),
}

export default apiClient
