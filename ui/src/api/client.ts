import axios from 'axios'
import { API_CONFIG } from '../config/api'
import type {
  StatBand, Comparison, DataBlock, ProcessSteps, FaqItem, QuickTopic, SectionOverrides,
} from '../renderengine/homepage/types'

// A frozen/editable welcome payload -- mirrors the public endpoint's homepage
// fields (see app/api/space.py build_homepage_fields).
export interface HomepagePayload {
  homepage_sections?: string[]
  description?: string
  suggestions?: string[]
  key_benefits?: string[]
  capabilities?: string[]
  faq?: FaqItem[]
  quick_topics?: QuickTopic[]
  trust_badges?: string[]
  stat_band?: StatBand
  comparison?: Comparison
  data_block?: DataBlock
  process_steps?: ProcessSteps
  section_overrides?: SectionOverrides
}

// Background document ingestion (app/models/ingestion_job.py).
export type IngestionStatus = 'queued' | 'parsing' | 'chunking' | 'indexing' | 'done' | 'failed'

export interface IngestionJob {
  id: string
  filename: string
  doc_type: string | null
  kb_name: string | null
  kb_id: string | null
  source: 'file' | 'url'   // which KB tab this job's progress belongs under
  status: IngestionStatus
  progress: number
  stage_detail: string | null
  eta_seconds?: number | null
  context_enriched?: boolean
  ai_cost_usd?: number
  doc_id: string | null
  pages: number | null
  chunks: number | null
  error: string | null
  created_at: string | null
  updated_at: string | null
}


export interface IngestionJobAccepted {
  job_id: string
  filename: string
  status: IngestionStatus
  message: string
}

export const INGESTION_TERMINAL: IngestionStatus[] = ['done', 'failed']

// What /rag/preview-url returns: the extracted text plus the facts that reveal
// a wrong scrape (a redirect landing elsewhere, an empty JS-rendered shell).
export type PreviewMode = 'quick' | 'deep'

export type PreviewQuality = {
  rating: 'good' | 'questionable' | 'poor'
  score: number
  reasons: string[]
}

export interface UrlPreview {
  preview_token: string
  title: string
  final_url: string
  content_type: string
  size_bytes: number
  page_count: number
  char_count: number
  extract: string
  truncated: boolean
  vision_skipped: boolean   // PDF: images are read at index time, not in this extract
  mode: PreviewMode
  provider: string
  quality: PreviewQuality
}

export interface HomepageSnapshot {
  published: boolean
  draft_payload: HomepagePayload | null
  published_payload?: HomepagePayload | null
  generated_at: string | null
  published_at: string | null
}

export type AgentKind = 'builtin' | 'custom'

export interface AgentDataSourceTool {
  id: string
  name: string
  display_name: string
  method: string
  path: string
  connection_name: string
  assigned: boolean
}

export interface AgentDataSourceToolsResponse {
  chatbot_id: string
  agent_kind: AgentKind
  agent_id: string
  tools: AgentDataSourceTool[]
}

export interface ReplaceAgentDataSourceToolsPayload {
  chatbot_id: string
  tool_ids: string[]
}

export interface ReplaceAgentDataSourceToolsResponse {
  chatbot_id: string
  agent_kind: AgentKind
  agent_id: string
  assignments: Array<Record<string, unknown>>
}

// Tenant-scoped Evaluation Lab contracts. These intentionally omit model
// reasoning and raw tool payloads: the backend never exposes either field.
export interface EvaluationExpectation {
  expected_agent: string | null
  required_terms: string[]
  forbidden_terms: string[]
  expected_source_ids: string[]
  expected_rag_hit: boolean | null
  expected_escalation: boolean | null
  max_response_ms: number | null
}

export interface EvaluationCheck {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  detail: string
}

export interface EvaluationSuite {
  id: string
  chatbot_id: string | null
  name: string
  description: string | null
  critical: boolean
  created_at: string
  updated_at: string
}

export interface EvaluationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EvaluationCase {
  id: string
  suite_id: string
  name: string
  question: string
  history: EvaluationMessage[]
  customer_context: Record<string, string | number | boolean | null>
  expectation: EvaluationExpectation
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface EvaluationRun {
  id: string
  suite_id: string
  target: 'draft' | 'published'
  status: 'running' | 'completed' | 'failed'
  total_cases: number
  passed_cases: number
  failed_cases: number
  started_at: string
  completed_at: string | null
}

export interface EvaluationResult {
  id: string
  run_id: string
  case_id: string
  passed: boolean
  checks: EvaluationCheck[]
  failures: string[]
  actual_response: string
  actual_agent: string | null
  actual_source_ids: string[]
  actual_rag_hit: boolean
  actual_escalated: boolean
  response_ms: number | null
  created_at: string
}

export interface EvaluationSuiteCreate {
  name: string
  description?: string | null
  chatbot_id: string
  critical: boolean
}

export interface EvaluationCaseCreate {
  name: string
  question: string
  history: EvaluationMessage[]
  customer_context: Record<string, string | number | boolean | null>
  expectation: EvaluationExpectation
  enabled: boolean
}

const http = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token from Zustand store on every request
http.interceptors.request.use(config => {
  try {
    const stored = localStorage.getItem(import.meta.env.PROD ? 'support247-store' : 'support247-store-dev')
    if (stored) {
      const parsed = JSON.parse(stored)
      const token = parsed?.state?.token
      if (token) config.headers['Authorization'] = `Bearer ${token}`
    }
  } catch { /* ignore */ }
  return config
})

// A 401 here always means the stored owner session is no longer valid (JWT
// expired, or revoked via token_version bump on logout-all/password change) --
// every call on this instance already carries a token, and login/register use
// their own separate fetch() calls (see useAuthForm.ts), so this can never
// misfire on a login attempt. Without this, PrivateRoute only checks that
// *some* token string is stored, not that the server still accepts it, so
// every dashboard page was left to silently fail its own requests forever
// with no way back to login except manually clicking Sign out.
http.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith('/app/login')) {
      import('../store/useAppStore').then(({ useAppStore }) => {
        useAppStore.getState().logout()
        window.location.assign('/app/login')
      })
    }
    return Promise.reject(err)
  },
)

export const apiClient = {
  healthCheck: () => http.get(API_CONFIG.endpoints.health).then(r => r.data),

  sendMessage: (message: string, conversationId?: string, spaceId?: string) =>
    http.post(API_CONFIG.endpoints.chat, { message, conversation_id: conversationId, org_id: spaceId }).then(r => r.data),

  getAgentStatus: () =>
    http.get(API_CONFIG.endpoints.agents).then(r => r.data),

  analyzeSentiment: (message: string) =>
    http.post(API_CONFIG.endpoints.sentiment, { message }).then(r => r.data),

  // RAG
  // Returns 202 with a job to poll -- ingestion runs in the background, so this
  // resolves in milliseconds even for documents that take minutes to process.
  uploadDoc: (file: File | null, clientId?: string, docType?: string, kbName?: string, kbDescription?: string, expiryDate?: string, kbId?: string, itemTitle?: string, topic?: string, docLabel?: string, previewToken?: string): Promise<IngestionJobAccepted> => {
    const form = new FormData()
    if (file) {
      form.append('file', file)
    } else {
      // Axios may omit the multipart boundary if the FormData is completely empty,
      // which causes FastAPI to fail with a 400 Missing Boundary error.
      // Appending a dummy field ensures a valid multipart payload.
      form.append('__empty_multipart_dummy', '1')
    }
    return http.post(API_CONFIG.endpoints.ragUpload, form, {
      headers: {
        'Content-Type': undefined,   // let axios set multipart boundary automatically
        ...(clientId      ? { 'X-Client-Id':      clientId      } : {}),
        ...(docType       ? { 'X-Doc-Type':        docType       } : {}),
        ...(kbName        ? { 'X-KB-Name':         kbName        } : {}),
        ...(kbDescription ? { 'X-KB-Description':  kbDescription } : {}),
        ...(expiryDate    ? { 'X-KB-Expiry':       expiryDate    } : {}),
        ...(kbId          ? { 'X-KB-Id':           kbId          } : {}),
        ...(itemTitle     ? { 'X-Item-Title':      itemTitle     } : {}),
        ...(topic         ? { 'X-Topic':           topic         } : {}),
        ...(docLabel      ? { 'X-Doc-Label':       docLabel      } : {}),
        ...(previewToken  ? { 'X-Preview-Token':   previewToken  } : {}),
      },
    }).then(r => r.data)
  },

  previewDoc: (file: File): Promise<UrlPreview> => {
    const form = new FormData()
    form.append('file', file)
    return http.post(API_CONFIG.endpoints.ragPreviewDoc, form, {
      headers: {
        'Content-Type': undefined,
      },
    }).then(r => r.data)
  },

  suggestDocMetadata: (payload: { doc_id?: string; item_id?: string; filename?: string; title?: string; url?: string; content?: string; file?: File }): Promise<{ title?: string; doc_type?: string; scope?: string; description: string; topic: string; tags?: string[] }> => {
    if (payload.file) {
      const formData = new FormData()
      formData.append('file', payload.file)
      if (payload.doc_id) formData.append('doc_id', payload.doc_id)
      if (payload.title) formData.append('title', payload.title)
      if (payload.url) formData.append('url', payload.url)
      if (payload.content) formData.append('content', payload.content)
      return http.post('/api/v1/suggestions/metadata', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    }
    return http.post('/api/v1/suggestions/metadata', payload).then(r => r.data)
  },

  suggestTerms: (query: string): Promise<{ terms: { word: string }[] }> =>
    http.get('/api/v1/suggestions/terms', { params: { query } }).then(r => r.data),

  listIngestionJobs: (limit = 20): Promise<{ jobs: IngestionJob[] }> =>
    http.get('/api/v1/documents/ingestion-jobs', { params: { limit } }).then(r => r.data),

  // Clear a finished (usually failed) job row. Failures stay visible until
  // dismissed, so without this one old failure haunts the KB forever.
  dismissIngestionJob: (jobId: string) =>
    http.delete(`/api/v1/documents/ingestion-jobs/${jobId}`).then(r => r.data),

  // Re-queue a failed job from its stored payload (202 + job, like an upload).
  retryIngestionJob: (jobId: string): Promise<IngestionJobAccepted> =>
    http.post(`/api/v1/documents/ingestion-jobs/${jobId}/retry`).then(r => r.data),

  getIngestionJob: (jobId: string): Promise<IngestionJob> =>
    http.get(`/api/v1/documents/ingestion-jobs/${jobId}`).then(r => r.data),

  listDocs: () =>
    http.get(API_CONFIG.endpoints.ragList).then(r => r.data),

  deleteDoc: (docId: string) =>
    http.delete(API_CONFIG.endpoints.ragDelete(docId)).then(r => r.data),

  // kbId is required for the scraped page to be reachable: custom agents scope
  // retrieval by kb_id, so omitting it indexes content no agent can ever find.
  // Fetch + parse a URL and return what was extracted, WITHOUT indexing it.
  // The returned preview_token holds the exact bytes; passing it to scrapeUrl
  // ingests precisely what was shown, with no second fetch.
  previewUrl: (url: string, mode: PreviewMode = 'quick'): Promise<UrlPreview> =>
    http.post('/api/v1/documents/rag/preview-url', { url, mode }, { timeout: 120000 }).then(r => r.data),

  // kbId is required for the scraped page to be reachable: custom agents scope
  // retrieval by kb_id, so omitting it indexes content no agent can ever find.
  scrapeUrl: (url: string, title?: string, _clientId?: string, docType?: string, kbName?: string, description?: string, kbId?: string, previewToken?: string, topic?: string, docLabel?: string, previewMode: PreviewMode = 'quick') =>
    http.post('/api/v1/documents/rag/ingest-url', { url, title: title ?? '', doc_type: docType ?? 'general', kb_name: kbName ?? '', kb_id: kbId ?? null, description: description ?? '', preview_token: previewToken ?? null, topic: topic ?? '', doc_label: docLabel ?? '', preview_mode: previewMode }).then(r => r.data),


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

  // Data Source Tool Registry (v2)
  importDataSourceDraft: (payload: { kind: 'curl' | 'openapi'; content: string; operation_id?: string }) =>
    http.post('/api/v1/data-sources/import', payload).then(r => r.data),
  describeDataSourceDraft: (payload: { description: string; use_ai?: boolean }) =>
    http.post('/api/v1/data-sources/describe', payload).then(r => r.data),
  analyzeDataSourceDraft: (payload: object) =>
    http.post('/api/v1/data-sources/analyze', payload).then(r => r.data),
  testDataSourceDraft: (payload: object) =>
    http.post('/api/v1/data-sources/test', payload).then(r => r.data),
  listDataSourceConnections: () =>
    http.get('/api/v1/data-sources/connections').then(r => r.data),
  createDataSourceConnection: (payload: object) =>
    http.post('/api/v1/data-sources/connections', payload).then(r => r.data),
  updateDataSourceConnection: (id: string, payload: object) =>
    http.patch(`/api/v1/data-sources/connections/${id}`, payload).then(r => r.data),
  deleteDataSourceConnection: (id: string) =>
    http.delete(`/api/v1/data-sources/connections/${id}`).then(r => r.data),
  listDataSourceTools: (connectionId?: string) =>
    http.get('/api/v1/data-sources/tools', { params: connectionId ? { connection_id: connectionId } : {} }).then(r => r.data),
  createDataSourceTool: (payload: object) =>
    http.post('/api/v1/data-sources/tools', payload).then(r => r.data),
  updateDataSourceTool: (id: string, payload: object) =>
    http.patch(`/api/v1/data-sources/tools/${id}`, payload).then(r => r.data),
  deleteDataSourceTool: (id: string) =>
    http.delete(`/api/v1/data-sources/tools/${id}`).then(r => r.data),
  replaceDataSourceAssignments: (toolId: string, payload: object) =>
    http.put(`/api/v1/data-sources/tools/${toolId}/assignments`, payload).then(r => r.data),
  listAgentDataSourceTools: (
    agentKind: AgentKind,
    agentId: string,
    chatbotId: string,
  ): Promise<AgentDataSourceToolsResponse> =>
    http.get(`/api/v1/data-sources/agents/${agentKind}/${agentId}/tools`, {
      params: { chatbot_id: chatbotId },
    }).then(r => r.data),
  replaceAgentDataSourceTools: (
    agentKind: AgentKind,
    agentId: string,
    payload: ReplaceAgentDataSourceToolsPayload,
  ): Promise<ReplaceAgentDataSourceToolsResponse> =>
    http.put(`/api/v1/data-sources/agents/${agentKind}/${agentId}/tools`, payload).then(r => r.data),
  testDataSourceTool: (toolId: string, payload: object) =>
    http.post(`/api/v1/data-sources/tools/${toolId}/execute-test`, payload).then(r => r.data),

  // Org Knowledge Base (legacy chunks viewer)
  getDocChunks: (docId: string) =>
    http.get(`/api/v1/org/kb/${docId}/chunks`).then(r => r.data),

  // Knowledge Bases (new structured KB API)
  listKBs: () =>
    http.get(API_CONFIG.endpoints.kbList).then(r => r.data),
  createKB: (payload: { name: string; description?: string; default_topic?: string }) =>
    http.post(API_CONFIG.endpoints.kbCreate, payload).then(r => r.data),
  updateKB: (id: string, payload: { name?: string; description?: string; default_topic?: string; active?: boolean }) =>
    http.patch(API_CONFIG.endpoints.kbUpdate(id), payload).then(r => r.data),
  deleteKB: (id: string) =>
    http.delete(API_CONFIG.endpoints.kbDelete(id)).then(r => r.data),
  listKBItems: (kbId: string) =>
    http.get(API_CONFIG.endpoints.kbItems(kbId)).then(r => r.data),
  addKBItem: (kbId: string, payload: { item_type: string; title?: string; doc_id?: string; question?: string; content?: string; topic?: string; doc_label?: string; description?: string }) =>
    http.post(API_CONFIG.endpoints.kbItemAdd(kbId), payload).then(r => r.data),
  deleteKBItem: (kbId: string, itemId: string) =>
    http.delete(API_CONFIG.endpoints.kbItemDelete(kbId, itemId)).then(r => r.data),

  updateKBItem: (kbId: string, itemId: string, payload: { question?: string; content?: string; title?: string; topic?: string; doc_label?: string; description?: string }) =>
    http.patch(API_CONFIG.endpoints.kbItemUpdate(kbId, itemId), payload).then(r => r.data),

  // KB Facts — confirmed attributes injected into every answer. Extraction
  // proposes (verified=false); nothing reaches an agent until confirmed.
  listFacts: (kbId: string) =>
    http.get(`/api/v1/space/knowledge-bases/${kbId}/facts`).then(r => r.data),
  createFact: (kbId: string, payload: { subject: string; label: string; value: string; note?: string; topic?: string }) =>
    http.post(`/api/v1/space/knowledge-bases/${kbId}/facts`, payload).then(r => r.data),
  extractFacts: (kbId: string, docId: string) =>
    http.post(`/api/v1/space/knowledge-bases/${kbId}/facts/extract`, { doc_id: docId }, { timeout: 120000 }).then(r => r.data),
  extractFactsV2: (kbId: string, docId: string, feedback?: string) =>
    http.post(`/api/v1/space/knowledge-bases/${kbId}/documents/${docId}/extract-v2`, feedback ? { feedback } : undefined, { timeout: 120000 }).then(r => r.data),
  verifyExtractFactsV2: (kbId: string, docId: string, facts: any[], feedback?: string) =>
    http.post(`/api/v1/space/knowledge-bases/${kbId}/documents/${docId}/extract-v2/verify`, { facts, feedback: feedback || undefined }, { timeout: 120000 }).then(r => r.data),
  graphifyExtractFactsV2: async (kbId: string, docId: string, facts: any[]) => {
    console.time("graphifyExtractFactsV2 request");
    const res = await http.post(`/api/v1/space/knowledge-bases/${kbId}/documents/${docId}/extract-v2/graphify`, { facts }, { timeout: 1800000 });
    console.timeEnd("graphifyExtractFactsV2 request");
    return res.data;
  },
  getExtractFactsV2Status: (kbId: string, docId: string) =>
    http.get(`/api/v1/space/knowledge-bases/${kbId}/documents/${docId}/extract-v2`).then(r => r.data),
  syncExtractFactsChat: (kbId: string, docId: string, chatHistory: any[]) =>
    http.post(`/api/v1/space/knowledge-bases/${kbId}/documents/${docId}/extract-v2/chat`, { chat_history: chatHistory }).then(r => r.data),
  commitExtractFactsV2: (kbId: string, docId: string, facts: any[]) =>
    http.post(`/api/v1/space/knowledge-bases/${kbId}/documents/${docId}/extract-v2/commit`, { facts }).then(r => r.data),
  
  submitTrainingFeedback: (original_subjects: string[], corrected_hierarchy: any) =>
    http.post('/api/v1/training/feedback', { original_subjects, corrected_hierarchy }).then(r => r.data),
  // note/topic accept null so a caller can clear them — the API treats null as
  // "no change" only when the key is absent, and "" as an explicit clear.
  updateFact: (kbId: string, factId: string, payload: { subject?: string; label?: string; value?: string; note?: string | null; topic?: string | null; verified?: boolean }) =>
    http.patch(`/api/v1/space/knowledge-bases/${kbId}/facts/${factId}`, payload).then(r => r.data),
  deleteFact: (kbId: string, factId: string) =>
    http.delete(`/api/v1/space/knowledge-bases/${kbId}/facts/${factId}`).then(r => r.data),

  markOnboardingComplete: () =>
    http.patch('/api/v1/auth/onboarding-complete').then(r => r.data),

  getAgentSuggestion: (payload: { doc_types?: string[]; kb_ids?: string[]; agent_name?: string; force?: boolean }) =>
    http.post('/api/v1/dashboard/agent-suggestions', payload).then(r => r.data),

  // Dashboard Stats
  getDashboardStats: () =>
    http.get('/api/v1/dashboard/stats').then(r => r.data),

  // Org Profile
  getProfile: () =>
    http.get('/api/v1/dashboard/profile').then(r => r.data),

  updateProfile: (payload: { display_name?: string; logo_url?: string; theme_color?: string; show_rag_citations?: boolean }) =>
    http.patch('/api/v1/dashboard/profile', payload).then(r => r.data),

  // Nav config
  getNavConfig: () =>
    http.get('/api/v1/dashboard/nav-config').then(r => r.data as {
      enabled_nav_items: string[]
      features: { data_sources: boolean }
    }),

  // Org Doc Types (distinct types from org's ChromaDB partition)
  listOrgDocTypes: () =>
    http.get('/api/v1/dashboard/doc-types').then(r => r.data),

  // Agent Meta Suggestions
  generateAgentSuggestion: (doc_types: string[], doc_id?: string, force?: boolean, agent_name?: string, kb_ids?: string[], doc_ids?: string[]) =>
    http.post('/api/v1/dashboard/agent-suggestions', { 
      doc_types, 
      doc_id: doc_id ?? null, 
      force: force ?? false, 
      agent_name: agent_name ?? null,
      kb_ids: kb_ids ?? [],
      doc_ids: doc_ids ?? []
    }).then(r => r.data),

  linkSuggestionToAgent: (suggestion_id: string, agent_id: string) =>
    http.patch('/api/v1/dashboard/agent-suggestions/link', { suggestion_id, agent_id }).then(r => r.data),

  // Org Agents — chatbotId scopes to a specific chatbot; omitted = space's default
  listOrgAgents: (chatbotId?: string | null) =>
    http.get('/api/v1/org/agents', { params: chatbotId ? { chatbot_id: chatbotId } : {} }).then(r => r.data),

  getOrgAgent: (id: string) =>
    http.get(`/api/v1/org/agents/${id}`).then(r => r.data),

  createOrgAgent: (payload: {
    name: string; description?: string; icon?: string; system_prompt?: string;
    temperature?: number; max_tokens?: number; rag_enabled?: boolean;
    rag_doc_types?: string[]; rag_top_k?: number; keywords?: string[];
    kb_ids?: string[]; kb_assignments?: { kb_id: string; doc_ids: string[] }[]; topics?: string[]; slug?: string;
    // Per-agent LLM override. null = inherit the chatbot default.
    llm_model?: string | null; reasoning_effort?: string | null
  }, chatbotId?: string | null) =>
    http.post('/api/v1/org/agents', payload, { params: chatbotId ? { chatbot_id: chatbotId } : {} }).then(r => r.data),

  updateOrgAgent: (id: string, payload: {
    name?: string
    description?: string
    system_prompt?: string
    temperature?: number
    max_tokens?: number
    active?: boolean
    keywords?: string[]
    rag_enabled?: boolean
    rag_doc_types?: string[]
    rag_top_k?: number
    kb_ids?: string[]
    kb_assignments?: { kb_id: string; doc_ids: string[] }[]
    // Topic slugs this agent answers for. [] = every document in its linked KBs.
    topics?: string[]
    // URL-safe routing key, unique per space. Omitted = unchanged.
    slug?: string
    // Per-agent LLM override. null = inherit the chatbot default.
    llm_model?: string | null; reasoning_effort?: string | null
  }, chatbotId?: string | null) =>
    http.patch(`/api/v1/org/agents/${id}`, payload, { params: chatbotId ? { chatbot_id: chatbotId } : {} }).then(r => r.data),


  deleteOrgAgent: (id: string) =>
    http.delete(`/api/v1/org/agents/${id}`).then(r => r.data),

  // Inbox (staff)
  staffLogin: (email: string, password: string) =>
    http.post('/api/v1/inbox/staff/login', { email, password }).then(r => r.data),
  listInboxSessions: (token: string, chatbotId?: string | null) =>
    http.get('/api/v1/inbox/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      params: chatbotId ? { chatbot_id: chatbotId } : {},
    }).then(r => Array.isArray(r.data) ? r.data : r.data?.sessions ?? []),
  getInboxSession: (id: string, token: string) =>
    http.get(`/api/v1/inbox/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  claimSession: (id: string, token: string) =>
    http.post(`/api/v1/inbox/sessions/${id}/claim`, {}, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  replySession: (id: string, content: string, token: string) =>
    http.post(`/api/v1/inbox/sessions/${id}/reply`, { content }, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  resolveSession: (id: string, token: string) =>
    http.post(`/api/v1/inbox/sessions/${id}/resolve`, {}, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  staffHeartbeat: (token: string) =>
    http.post('/api/v1/inbox/staff/heartbeat', {}, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),

  // Analytics — chatbotId scopes to a specific chatbot; omitted = space-wide
  getAnalytics: (days = 7, chatbotId?: string | null) =>
    http.get('/api/v1/dashboard/analytics', {
      params: { days, ...(chatbotId ? { chatbot_id: chatbotId } : {}) },
    }).then(r => r.data),

  // Evaluation Lab — deterministic suites against the current published runtime.
  listEvaluationSuites: (chatbotId?: string): Promise<EvaluationSuite[]> =>
    http.get('/api/v1/evaluations/suites', {
      params: chatbotId ? { chatbot_id: chatbotId } : {},
    }).then(r => r.data),
  createEvaluationSuite: (payload: EvaluationSuiteCreate): Promise<EvaluationSuite> =>
    http.post('/api/v1/evaluations/suites', payload).then(r => r.data),
  listEvaluationCases: (suiteId: string): Promise<EvaluationCase[]> =>
    http.get(`/api/v1/evaluations/suites/${suiteId}/cases`).then(r => r.data),
  createEvaluationCase: (suiteId: string, payload: EvaluationCaseCreate): Promise<EvaluationCase> =>
    http.post(`/api/v1/evaluations/suites/${suiteId}/cases`, payload).then(r => r.data),
  listEvaluationRuns: (suiteId?: string): Promise<EvaluationRun[]> =>
    http.get('/api/v1/evaluations/runs', {
      params: { limit: 100, ...(suiteId ? { suite_id: suiteId } : {}) },
    }).then(r => r.data),
  runEvaluationSuite: (suiteId: string): Promise<EvaluationRun> =>
    // The backend currently executes up to 50 five-minute cases sequentially.
    // Override the normal request timeout so the browser does not abandon a
    // still-valid synchronous run before the server returns its aggregate.
    http.post(
      `/api/v1/evaluations/suites/${suiteId}/runs`,
      { target: 'published' },
      { timeout: 15_300_000 },
    ).then(r => r.data),
  listEvaluationResults: (runId: string): Promise<EvaluationResult[]> =>
    http.get(`/api/v1/evaluations/runs/${runId}/results`).then(r => r.data),

  // Chatbot settings
  getChatbots: () =>
    http.get('/api/v1/chatbots').then(r => r.data),
  getChatbotQuota: (): Promise<{ count: number; limit: number; unlimited: boolean; can_create: boolean }> =>
    http.get('/api/v1/chatbots/quota').then(r => r.data),
  createChatbot: (payload: { slug: string; display_name: string; description?: string }) =>
    http.post('/api/v1/chatbots', payload).then(r => r.data),
  deleteChatbot: (slug: string) =>
    http.delete(`/api/v1/chatbots/${slug}`).then(r => r.data),
  setDefaultChatbot: (slug: string) =>
    http.post(`/api/v1/chatbots/${slug}/set-default`).then(r => r.data),
  updateChatbot: (slug: string, payload: { display_name?: string; description?: string; theme_color?: string; active?: boolean; human_transfer_enabled?: boolean; human_transfer_message?: string; clarify_enabled?: boolean; show_logo?: boolean; homepage_sections_enabled?: boolean; homepage_sections_override?: string;     quick_topics?: string; trust_badges?: string; login_after_messages?: number | null;
    // Chatbot-level LLM defaults. null = inherit the server env config.
    llm_model?: string | null; reasoning_effort?: string | null }) =>
    http.patch(`/api/v1/chatbots/${slug}`, payload).then(r => r.data),
  getStatMetrics: (slug: string): Promise<{ metrics: { id: string; value: string; label: string; position: number }[] }> =>
    http.get(`/api/v1/chatbots/${slug}/stat-metrics`).then(r => r.data),
  setStatMetrics: (slug: string, metrics: { value: string; label: string }[]): Promise<{ metrics: { id: string; value: string; label: string; position: number }[] }> =>
    http.put(`/api/v1/chatbots/${slug}/stat-metrics`, { metrics }).then(r => r.data),
  getComparison: (slug: string): Promise<{ columns: string[]; rows: string[][]; source: string }> =>
    http.get(`/api/v1/chatbots/${slug}/comparison`).then(r => r.data),
  setComparison: (slug: string, grid: { columns: string[]; rows: string[][]; source: string }): Promise<{ columns: string[]; rows: string[][]; source: string }> =>
    http.put(`/api/v1/chatbots/${slug}/comparison`, grid).then(r => r.data),

  // ── Chatbot UI snapshot (generate-once, edit, publish) ──
  getHomepageUi: (slug: string): Promise<HomepageSnapshot> =>
    http.get(`/api/v1/chatbots/${slug}/homepage-ui`).then(r => r.data),
  generateHomepageUi: (slug: string): Promise<HomepageSnapshot> =>
    // Blocking build (waits for web-grounded sections) -- allow up to 2 min.
    http.post(`/api/v1/chatbots/${slug}/homepage-ui/generate`, undefined, { timeout: 120000 }).then(r => r.data),
  saveHomepageUiDraft: (slug: string, payload: HomepagePayload): Promise<HomepageSnapshot> =>
    http.put(`/api/v1/chatbots/${slug}/homepage-ui`, { payload }).then(r => r.data),
  publishHomepageUi: (slug: string): Promise<{ published: boolean; published_at: string }> =>
    http.post(`/api/v1/chatbots/${slug}/homepage-ui/publish`).then(r => r.data),
  unpublishHomepageUi: (slug: string): Promise<{ published: boolean }> =>
    http.post(`/api/v1/chatbots/${slug}/homepage-ui/unpublish`).then(r => r.data),

  // ── AI System Prompt Generation & Taxonomy Extractor ──
  generateTriagePrompt: (slug: string): Promise<{ status: string; generated_prompt: string; specialist_agent_count: number; kb_count: number }> =>
    http.post(`/api/v1/chatbots/${slug}/triage-agent/generate-prompt`, undefined, { timeout: 60000 }).then(r => r.data),
  generateAgentPrompt: (agentId: string): Promise<{ status: string; generated_prompt: string }> =>
    http.post(`/api/v1/space-agents/${agentId}/generate-prompt`, undefined, { timeout: 60000 }).then(r => r.data),

  uploadChatbotLogo: (slug: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post(`/api/v1/chatbots/${slug}/logo`, form, {
      headers: { 'Content-Type': undefined },   // let axios set multipart boundary automatically
    }).then(r => r.data)
  },
  deleteChatbotLogo: (slug: string) =>
    http.delete(`/api/v1/chatbots/${slug}/logo`).then(r => r.data),
  listStaffMembers: (token: string) =>
    http.get('/api/v1/inbox/staff', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  createStaffMember: (token: string, payload: { name: string; email: string; password: string }) =>
    http.post('/api/v1/inbox/staff', payload, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  deleteStaffMember: (id: string, token: string) =>
    http.delete(`/api/v1/inbox/staff/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
  transferSession: (sessionId: string, targetStaffId: string, token: string) =>
    http.post(`/api/v1/inbox/sessions/${sessionId}/transfer`, { target_staff_id: targetStaffId }, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data),
}

export default apiClient
