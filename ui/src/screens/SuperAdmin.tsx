import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Bot, MessageSquare, BarChart3, Activity,
  Search, ChevronDown, ChevronUp, Shield, RefreshCw,
  CheckCircle, XCircle, Eye, EyeOff, Database, Zap, HardDrive, FileText, Layers, Trash2, Loader2, X,
} from 'lucide-react'

// ── Chunks Modal ──────────────────────────────────────────────────────────────

interface Chunk { chunk_index: number; page: number; section: string; text: string }

function ChunksModal({ clientId, docId, docName, adminKey, onClose }: {
  clientId: string; docId: string; docName: string; adminKey: string; onClose: () => void
}) {
  const [chunks, setChunks]   = React.useState<Chunk[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState('')
  const [expanded, setExpanded] = React.useState<number | null>(null)

  React.useEffect(() => {
    fetch(`${API}/vectordb/${clientId}/${docId}/chunks`, {
      headers: { 'X-Super-Admin-Key': adminKey },
    })
      .then(r => r.json())
      .then(data => setChunks(data.chunks || []))
      .catch(() => setError('Failed to load chunks.'))
      .finally(() => setLoading(false))
  }, [clientId, docId, adminKey])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Chunks — {docName}</h3>
            {!loading && <p className="text-xs text-gray-500 mt-0.5">{chunks.length} chunks · {clientId}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && chunks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No chunks found.</p>
          )}
          {chunks.map((chunk, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-violet-600 dark:text-violet-400 w-6 text-right flex-shrink-0">#{i + 1}</span>
                  <span className="text-xs text-gray-500">Page {chunk.page}</span>
                  {chunk.section && <span className="text-xs text-gray-400 truncate max-w-[200px]">· {chunk.section}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-400">{chunk.text.length} chars</span>
                  {expanded === i ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </div>
              </button>
              {expanded === i && (
                <div className="px-4 py-3 bg-white dark:bg-gray-900">
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">{chunk.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const API = '/api/v1/super-admin'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  total_orgs: number
  active_orgs: number
  total_agents: number
  active_agents: number
  total_messages: number
  messages_24h: number
  total_skills: number
}

interface Org {
  id: string
  slug: string
  display_name: string
  email: string
  plan: string
  active: boolean
  created_at: string
  agent_count: number
  active_agents: number
  message_count: number
  skill_count: number
}

interface Agent {
  id: string
  org_slug: string
  org_name: string
  slug: string
  name: string
  agent_type: string
  icon: string
  active: boolean
  is_builtin: boolean
  rag_enabled: boolean
}

interface LogEntry {
  id: string
  org_slug: string
  org_name: string
  session_id: string
  role: string
  message: string
  intent: string | null
  agent_slug: string | null
  rag_hit: boolean | null
  response_ms: number | null
  timestamp: string
}

// ── API helper ────────────────────────────────────────────────────────────────

function api(key: string) {
  const headers = { 'X-Super-Admin-Key': key, 'Content-Type': 'application/json' }
  return {
    get: (path: string) => fetch(`${API}${path}`, { headers }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() }),
    patch: (path: string, body: object) => fetch(`${API}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() }),
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any, label: string, value: number | string, sub?: string, color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode, color: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{children}</span>
}

// ── OrgRow ────────────────────────────────────────────────────────────────────

interface KbDoc {
  doc_id: string
  filename: string
  doc_name: string
  kb_name: string
  doc_type: string
  description: string
  uploaded_at: string
  expires_at: string
}

function OrgRow({ org, adminKey, onRefresh, onViewChunks }: {
  org: Org, adminKey: string, onRefresh: () => void,
  onViewChunks: (clientId: string, docId: string, docName: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<{ agents: Agent[], skills: any[], kb_docs: KbDoc[] } | null>(null)
  const [toggling, setToggling] = useState(false)

  const loadDetail = async () => {
    if (detail) { setExpanded(e => !e); return }
    const data = await api(adminKey).get(`/orgs/${org.id}`)
    setDetail({ agents: data.agents, skills: data.skills, kb_docs: data.kb_docs || [] })
    setExpanded(true)
  }

  const toggleActive = async () => {
    setToggling(true)
    try {
      await api(adminKey).patch(`/orgs/${org.id}`, { active: !org.active })
      onRefresh()
    } finally {
      setToggling(false)
    }
  }

  const changePlan = async (plan: string) => {
    await api(adminKey).patch(`/orgs/${org.id}`, { plan })
    onRefresh()
  }

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td className="px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{org.display_name}</p>
            <p className="text-xs text-gray-500">@{org.slug}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{org.email}</td>
        <td className="px-4 py-3">
          <select
            value={org.plan}
            onChange={e => changePlan(e.target.value)}
            className="text-xs px-2 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
          >
            {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </td>
        <td className="px-4 py-3">
          {org.active
            ? <Badge color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">Active</Badge>
            : <Badge color="bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">Inactive</Badge>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 text-center">{org.active_agents}/{org.agent_count}</td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 text-center">{org.message_count.toLocaleString()}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{new Date(org.created_at).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleActive}
              disabled={toggling}
              title={org.active ? 'Deactivate' : 'Activate'}
              className={`p-1.5 rounded-lg transition-colors ${org.active ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500'}`}
            >
              {org.active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            </button>
            <button
              onClick={loadDetail}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-500 transition-colors"
              title="Expand"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </td>
      </tr>

      {expanded && detail && (
        <tr className="bg-indigo-50/50 dark:bg-indigo-900/10">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Agents ({detail.agents.length})</p>
                <div className="space-y-1.5">
                  {detail.agents.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <span>{a.icon}</span>
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{a.name}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{a.agent_type}</span>
                      {a.active
                        ? <Badge color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">on</Badge>
                        : <Badge color="bg-gray-100 dark:bg-gray-700 text-gray-500">off</Badge>}
                      {a.rag_enabled && <Badge color="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400">RAG</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Prompt Skills ({detail.skills.length})</p>
                <div className="space-y-1.5">
                  {detail.skills.length === 0 && <p className="text-xs text-gray-400">No skills configured.</p>}
                  {detail.skills.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{s.name}</span>
                      <Badge color="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">{s.skill_type}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Knowledge Docs ({detail.kb_docs.length})</p>
                <div className="space-y-2">
                  {detail.kb_docs.length === 0 && <p className="text-xs text-gray-400">No documents uploaded.</p>}
                  {detail.kb_docs.map(d => (
                    <div key={d.doc_id} className="text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{d.doc_name || d.filename}</span>
                        <Badge color="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400">{d.doc_type}</Badge>
                        <button
                          onClick={() => onViewChunks(org.slug, d.doc_id, d.doc_name || d.filename)}
                          className="flex items-center gap-0.5 text-indigo-500 hover:text-indigo-700 hover:underline"
                        >
                          <Eye className="w-3 h-3" /> View chunks
                        </button>
                      </div>
                      <p className="text-gray-400 mt-0.5">
                        {d.kb_name && <span className="mr-2">KB: {d.kb_name}</span>}
                        {d.uploaded_at && <span>{new Date(d.uploaded_at).toLocaleDateString()}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Agent Row ─────────────────────────────────────────────────────────────────

function AgentRow({ agent, adminKey, onToggled }: {
  agent: Agent
  adminKey: string
  onToggled: (id: string, active: boolean) => void
}) {
  const [toggling, setToggling] = React.useState(false)
  const isTriage = agent.slug === 'triage'

  const toggle = async () => {
    if (isTriage) return
    setToggling(true)
    try {
      await fetch(`${API}/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'X-Super-Admin-Key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !agent.active }),
      })
      onToggled(agent.id, !agent.active)
    } finally {
      setToggling(false)
    }
  }

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{agent.icon}</span>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{agent.name}</p>
            <p className="text-xs text-gray-400">@{agent.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">{agent.org_name}</p>
        <p className="text-xs text-gray-400">@{agent.org_slug}</p>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{agent.agent_type}</td>
      <td className="px-4 py-3">
        {agent.active
          ? <Badge color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">Active</Badge>
          : <Badge color="bg-gray-100 dark:bg-gray-700 text-gray-500">Inactive</Badge>}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {agent.is_builtin && <Badge color="bg-blue-50 dark:bg-blue-900/20 text-blue-500">built-in</Badge>}
          {agent.rag_enabled && <Badge color="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400">RAG</Badge>}
        </div>
      </td>
      <td className="px-4 py-3">
        {isTriage ? (
          <span className="text-xs text-gray-400 italic">locked</span>
        ) : (
          <button
            onClick={toggle}
            disabled={toggling}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
              agent.active
                ? 'text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            }`}
          >
            {toggling ? '…' : agent.active ? 'Disable' : 'Enable'}
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'orgs' | 'agents' | 'builtin' | 'activity' | 'vectordb'

// ── Builtin Agent Toggle Row ───────────────────────────────────────────────────

interface BuiltinAgentType {
  agent_type: string
  name: string
  icon: string
  slug: string
  platform_enabled: boolean
}

function BuiltinAgentRow({ agent, adminKey, onToggled }: {
  agent: BuiltinAgentType
  adminKey: string
  onToggled: (agent_type: string, enabled: boolean) => void
}) {
  const [loading, setLoading] = React.useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      await fetch(`${API}/builtin-agents/${agent.agent_type}`, {
        method: 'PATCH',
        headers: { 'X-Super-Admin-Key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform_enabled: !agent.platform_enabled }),
      })
      onToggled(agent.agent_type, !agent.platform_enabled)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-xl w-8 text-center">{agent.icon}</span>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{agent.name}</p>
          <p className="text-xs text-gray-400">{agent.agent_type} · @{agent.slug}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium ${agent.platform_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
          {agent.platform_enabled ? 'Enabled for all orgs' : 'Hidden from all orgs'}
        </span>
        {agent.slug === 'triage' ? (
          <span className="text-xs text-gray-400 italic">locked</span>
        ) : (
          <button
            onClick={toggle}
            disabled={loading}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
              agent.platform_enabled
                ? 'text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            }`}
          >
            {loading ? '…' : agent.platform_enabled ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  )
}

interface VectorDBOrg {
  client_id: string
  org_name: string
  doc_count: number
  chunk_count: number
  docs: { doc_id: string; doc_name: string; doc_type: string; kb_name: string; uploaded_at: string; expires_at: string; chunk_count: number }[]
}

interface VectorDBData {
  summary: { policy_documents: number; product_catalog: number; client_documents: number; persist_dir: string }
  orgs: VectorDBOrg[]
}

export function SuperAdmin() {
  const [key, setKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  const [stats, setStats] = useState<Stats | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [builtinAgents, setBuiltinAgents] = useState<BuiltinAgentType[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [vectorDB, setVectorDB] = useState<VectorDBData | null>(null)
  const [expandedVecOrg, setExpandedVecOrg] = useState<string | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [viewingChunks, setViewingChunks] = useState<{ clientId: string; docId: string; docName: string } | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = useCallback(async (k: string) => {
    setLoading(true)
    setError('')
    try {
      const [s, o, a, l, v] = await Promise.all([
        api(k).get('/stats'),
        api(k).get('/orgs?limit=100'),
        api(k).get('/agents'),
        api(k).get('/activity?limit=100'),
        api(k).get('/vectordb'),
      ])
      setStats(s)
      setOrgs(o.orgs)
      setAgents(a.agents)
      setLogs(l.logs)
      setVectorDB(v)
      // Non-fatal — requires migration 0015
      api(k).get('/builtin-agents').then(b => setBuiltinAgents(b.builtin_agents || [])).catch(() => {})
    } catch {
      setError('Failed to load data. Check the API key and that the backend is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    try {
      await api(keyInput).get('/stats')
      setKey(keyInput)
      fetchAll(keyInput)
    } catch {
      setAuthError('Invalid key.')
    }
  }

  const deleteVecDoc = async (clientId: string, docId: string) => {
    if (!confirm(`Delete doc ${docId}? This removes all its chunks from ChromaDB.`)) return
    setDeletingDoc(docId)
    try {
      await fetch(`${API}/vectordb/${clientId}/${docId}`, {
        method: 'DELETE',
        headers: { 'X-Super-Admin-Key': key },
      })
      const v = await api(key).get('/vectordb')
      setVectorDB(v)
    } finally {
      setDeletingDoc(null)
    }
  }

  const filteredOrgs = orgs.filter(o =>
    !search || o.slug.includes(search.toLowerCase()) || o.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const filteredLogs = logs.filter(l =>
    !search || l.org_slug.includes(search.toLowerCase()) || l.message.toLowerCase().includes(search.toLowerCase())
  )

  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-gray-900 dark:text-white'

  // ── Login gate ───────────────────────────────────────────────────────────────

  if (!key) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Super Admin</p>
              <p className="text-xs text-gray-500">Platform management</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Admin Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder="Enter super admin key"
                    required
                    className={inputCls}
                  />
                  <button type="button" onClick={() => setShowKey(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {authError && <p className="text-xs text-red-500">{authError}</p>}
              <button type="submit"
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors">
                Enter
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  const TABS: { id: Tab, label: string, icon: any }[] = [
    { id: 'overview',  label: 'Overview',       icon: BarChart3  },
    { id: 'orgs',      label: 'Organizations',  icon: Users      },
    { id: 'agents',    label: 'Agents',         icon: Bot        },
    { id: 'builtin',   label: 'Built-in',       icon: Zap        },
    { id: 'activity',  label: 'Activity',       icon: Activity   },
    { id: 'vectordb',  label: 'Vector DB',      icon: HardDrive  },
  ]

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Super Admin</h1>
            <p className="text-xs text-gray-500">Platform management dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchAll(key)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setKey('')}
            className="px-3 py-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users}         label="Total Orgs"       value={stats.total_orgs}      sub={`${stats.active_orgs} active`}          color="bg-indigo-500" />
          <StatCard icon={Bot}           label="Agents"           value={stats.total_agents}    sub={`${stats.active_agents} active`}         color="bg-violet-500" />
          <StatCard icon={MessageSquare} label="Total Messages"   value={stats.total_messages.toLocaleString()} sub={`${stats.messages_24h} last 24h`} color="bg-emerald-500" />
          <StatCard icon={Database}      label="Prompt Skills"    value={stats.total_skills}                                                  color="bg-amber-500" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {(tab === 'orgs' || tab === 'activity') && (
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'orgs' ? 'Search orgs…' : 'Search logs…'}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-gray-900 dark:text-white"
          />
        </div>
      )}

      {/* ── Overview ── */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Organizations by Plan</p>
            {['free', 'starter', 'pro', 'enterprise'].map(plan => {
              const count = orgs.filter(o => o.plan === plan).length
              const pct = orgs.length ? Math.round(count / orgs.length * 100) : 0
              return (
                <div key={plan} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400 capitalize">{plan}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                    <div className="h-1.5 bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Top Orgs by Messages</p>
            <div className="space-y-2.5">
              {[...orgs].sort((a, b) => b.message_count - a.message_count).slice(0, 6).map(o => (
                <div key={o.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{o.display_name}</p>
                    <p className="text-xs text-gray-400">@{o.slug}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{o.message_count.toLocaleString()} msgs</span>
                </div>
              ))}
              {orgs.length === 0 && <p className="text-xs text-gray-400">No organizations yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Organizations ── */}
      {tab === 'orgs' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                {['Organization', 'Email', 'Plan', 'Status', 'Agents', 'Messages', 'Created', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.map(org => (
                <OrgRow key={org.id} org={org} adminKey={key} onRefresh={() => fetchAll(key)}
                  onViewChunks={(cid, did, name) => setViewingChunks({ clientId: cid, docId: did, docName: name })} />
              ))}
              {filteredOrgs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No organizations found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Agents ── */}
      {tab === 'agents' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                {['Agent', 'Organization', 'Type', 'Status', 'Flags', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <AgentRow
                  key={a.id}
                  agent={a}
                  adminKey={key}
                  onToggled={(id, active) =>
                    setAgents(prev => prev.map(ag => ag.id === id ? { ...ag, active } : ag))
                  }
                />
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No agents found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Built-in Agents ── */}
      {tab === 'builtin' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Toggling a built-in agent off hides it from <strong>every organisation's</strong> agent panel immediately.
              Triage cannot be disabled — it is required for routing.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {builtinAgents.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No built-in agents found. Make sure at least one org exists.</p>
            )}
            {builtinAgents.map(agent => (
              <BuiltinAgentRow
                key={agent.agent_type}
                agent={agent}
                adminKey={key}
                onToggled={(type, enabled) =>
                  setBuiltinAgents(prev =>
                    prev.map(a => a.agent_type === type ? { ...a, platform_enabled: enabled } : a)
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Vector DB ── */}
      {tab === 'vectordb' && (
        <div className="space-y-4">
          {/* Access instructions */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">How to inspect ChromaDB directly</p>
            <div className="space-y-1 text-xs text-amber-700 dark:text-amber-400 font-mono">
              <p># Install the CLI</p>
              <p>pip install chromadb</p>
              <p className="mt-2"># Python REPL — from project root</p>
              <p>import chromadb</p>
              <p>c = chromadb.PersistentClient(path=".chroma_db")</p>
              <p>col = c.get_collection("client_documents")</p>
              <p>col.count()                          # total chunks</p>
              <p>col.get(limit=5, include=["metadatas"])  # sample metadata</p>
              <p className="mt-2"># Filter by org (client_id = org UUID)</p>
              <p>{'col.get(where={"client_id": {"$eq": "<org-uuid>"}}, include=["metadatas"])'}</p>
            </div>
          </div>

          {/* Summary cards */}
          {vectorDB && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Policy Chunks</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{vectorDB.summary.policy_documents}</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Database className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Product Chunks</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{vectorDB.summary.product_catalog}</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Client Chunks</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{vectorDB.summary.client_documents}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500">Persist dir: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{vectorDB.summary.persist_dir}</code></p>

              {/* Per-org breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Client Documents — per org</p>
                </div>
                {vectorDB.orgs.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">No client documents in vector DB.</p>
                )}
                {vectorDB.orgs.map(o => (
                  <div key={o.client_id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <button
                      onClick={() => setExpandedVecOrg(expandedVecOrg === o.client_id ? null : o.client_id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
                          <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{o.org_name || 'Unknown org'}</p>
                          <p className="text-xs text-gray-400">{o.client_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{o.doc_count} docs · {o.chunk_count} chunks</span>
                        {expandedVecOrg === o.client_id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {expandedVecOrg === o.client_id && (
                      <div className="px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-100 dark:border-gray-700">
                              <th className="text-left py-1.5 font-medium">Document</th>
                              <th className="text-left py-1.5 font-medium">Type</th>
                              <th className="text-left py-1.5 font-medium">KB Name</th>
                              <th className="text-left py-1.5 font-medium">Uploaded</th>
                              <th className="text-left py-1.5 font-medium">Expires</th>
                              <th className="text-right py-1.5 font-medium">Chunks</th>
                              <th className="py-1.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {o.docs.map(d => (
                              <tr key={d.doc_id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                                <td className="py-1.5 text-gray-700 dark:text-gray-300 font-medium">{d.doc_name || d.doc_id.slice(0, 8)}</td>
                                <td className="py-1.5"><Badge color="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400">{d.doc_type}</Badge></td>
                                <td className="py-1.5 text-gray-500">{d.kb_name || '—'}</td>
                                <td className="py-1.5 text-gray-400">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : '—'}</td>
                                <td className="py-1.5 text-gray-400">{d.expires_at ? new Date(d.expires_at).toLocaleDateString() : '—'}</td>
                                <td className="py-1.5 text-right text-gray-500">{d.chunk_count}</td>
                                <td className="py-1.5 pl-2 flex items-center gap-1">
                                  <button
                                    onClick={() => setViewingChunks({ clientId: o.client_id, docId: d.doc_id, docName: d.doc_name || d.doc_id })}
                                    className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-400 hover:text-indigo-600 transition-colors"
                                    title="View chunks"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteVecDoc(o.client_id, d.doc_id)}
                                    disabled={deletingDoc === d.doc_id}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
                                    title="Delete from ChromaDB"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Activity ── */}
      {tab === 'activity' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                {['Time', 'Org', 'Role', 'Message', 'Agent', 'Intent', 'ms'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">@{l.org_slug}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge color={l.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}>
                      {l.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate">{l.message}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{l.agent_slug || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{l.intent || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{l.response_ms ?? '—'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Chunks Viewer Modal */}
      {viewingChunks && (
        <ChunksModal
          clientId={viewingChunks.clientId}
          docId={viewingChunks.docId}
          docName={viewingChunks.docName}
          adminKey={key}
          onClose={() => setViewingChunks(null)}
        />
      )}
    </div>
  )
}
