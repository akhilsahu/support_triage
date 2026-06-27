export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  agent?: string
  sentimentScore?: number
  sources?: SourceItem[]
  isStreaming?: boolean
}

export interface SourceItem {
  chunk_index?: number
  page: number
  section: string
  score: number
  excerpt: string
  filename?: string
}

export interface AgentStatus {
  name: string
  type: string
  status: 'idle' | 'active' | 'processing'
  tasksCompleted: number
  model?: string
}

export interface RagDoc {
  doc_id: string
  filename: string
  extension: string
  pages: number
  chunks: number
  collection: string
  doc_type?: string
  client_id?: string
  kb_name?: string
  space_name?: string
  description?: string
  uploaded_at?: string
  expires_at?: string
}

export interface StatsData {
  policy_documents: number
  product_catalog: number
  client_documents: number
  persist_dir?: string
}
