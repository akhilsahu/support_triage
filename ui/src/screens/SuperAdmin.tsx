import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Bot, MessageSquare, BarChart3, Activity,
  Search, ChevronDown, ChevronUp, Shield, RefreshCw,
  CheckCircle, XCircle, Eye, EyeOff, Database, Zap, HardDrive, FileText, Layers, Trash2, Loader2, X, Blocks,
  Home as HomeIcon,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

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

import { API_CONFIG } from '@/config/api'
const API = `${API_CONFIG.baseURL}/api/v1/super-admin`

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

interface Space {
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
  max_chatbots?: number | null
}

interface Agent {
  id: string
  space_slug: string
  space_name: string
  slug: string
  name: string
  agent_type: string
  icon: string
  active: boolean
  is_builtin: boolean
  rag_enabled: boolean
}

interface IntegrationPackage {
  id: string
  slug: string
  name: string
  icon_url: string
  is_active: boolean
}

interface LogEntry {
  id: string
  space_slug: string
  space_name: string
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

// ── SpaceRow ────────────────────────────────────────────────────────────────────

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

// Master control: the global default chatbot cap for every space without an override.
function ChatbotLimitsControl({ adminKey }: { adminKey: string }) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api(adminKey).get('/chatbot-limits')
      .then((d: any) => setInput(String(d.default_max_chatbots)))
      .catch(() => {})
  }, [adminKey])

  const save = async () => {
    const n = parseInt(input, 10)
    if (Number.isNaN(n)) return
    setSaving(true)
    try {
      const d = await api(adminKey).patch('/chatbot-limits', { default_max_chatbots: n })
      setInput(String(d.default_max_chatbots))
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Chatbots per space — default for all</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Applies to every space that has no per-row override. 1 = single bot (multi off), -1 = unlimited.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          title="Number of chatbots per space (-1 = unlimited)"
          className="w-24 text-sm px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg border border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// Master control (Factor 1): platform-wide switch for the AI homepage-sections
// renderengine. Individual spaces can still turn their own bot's toggle
// (Factor 2, in ChatbotProfile) on or off, but it only takes effect when this
// is also on -- same pattern as BuiltinAgentCatalog.platform_enabled.
function HomepageSectionsPlatformControl({ adminKey }: { adminKey: string }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api(adminKey).get('/homepage-sections')
      .then((d: any) => setEnabled(!!d.homepage_sections_platform_enabled))
      .catch(() => {})
  }, [adminKey])

  const toggle = async () => {
    setLoading(true)
    try {
      const d = await api(adminKey).patch('/homepage-sections', { homepage_sections_platform_enabled: !enabled })
      setEnabled(!!d.homepage_sections_platform_enabled)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">AI homepage sections — platform switch</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Master switch for the AI-composed pre-chat welcome screen. Spaces can enable it per chatbot in
          Chatbot Profile, but it stays inactive for everyone until this is on.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium ${enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
          {enabled ? 'Enabled platform-wide' : 'Disabled platform-wide'}
        </span>
        <button
          onClick={toggle}
          disabled={loading}
          className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
            enabled
              ? 'text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
          }`}
        >
          {loading ? '…' : enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  )
}

interface DataSourcesFeatureState {
  platform_enabled: boolean
}

interface SpaceDataSourcesFeatureState {
  override: boolean | null
  effective_enabled: boolean
}

export function DataSourcesPlatformControl({ adminKey, value, onChange }: {
  adminKey: string
  value: boolean | null
  onChange: (enabled: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const enabled = value === true

  const toggle = async () => {
    setSaving(true)
    try {
      const data: DataSourcesFeatureState = await api(adminKey).patch('/data-sources-feature', {
        platform_enabled: !enabled,
      })
      onChange(data.platform_enabled)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Data Sources</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Controls datasource APIs, agent tools, routes, and menu availability.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium ${enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
          {value === null ? 'Loading…' : enabled ? 'Enabled platform-wide' : 'Disabled platform-wide'}
        </span>
        <button
          onClick={toggle}
          disabled={saving || value === null}
          aria-label={enabled ? 'Disable Data Sources' : 'Enable Data Sources'}
          className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
            enabled
              ? 'text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
          }`}
        >
          {saving ? 'Saving…' : enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  )
}

function SpaceRow({ space, adminKey, onRefresh, onViewChunks, onConfigNav }: {
  space: Space, adminKey: string, onRefresh: () => void,
  onViewChunks: (clientId: string, docId: string, docName: string) => void
  onConfigNav: (space: Space) => void
}) {
  const [toggling, setToggling] = useState(false)
  const [limitInput, setLimitInput] = useState(space.max_chatbots == null ? '' : String(space.max_chatbots))

  const toggleActive = async () => {
    setToggling(true)
    try {
      await api(adminKey).patch(`/orgs/${space.id}`, { active: !space.active })
      onRefresh()
    } finally {
      setToggling(false)
    }
  }

  const changePlan = async (plan: string) => {
    await api(adminKey).patch(`/orgs/${space.id}`, { plan })
    onRefresh()
  }

  const commitMaxChatbots = async () => {
    // Blank → null (inherit global); -1 → unlimited; else the entered number.
    const raw = limitInput.trim()
    const max_chatbots = raw === '' ? null : parseInt(raw, 10)
    if (raw !== '' && Number.isNaN(max_chatbots)) return
    if ((space.max_chatbots ?? null) === max_chatbots) return   // no-op
    await api(adminKey).patch(`/orgs/${space.id}`, { max_chatbots })
    onRefresh()
  }

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td className="px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{space.display_name}</p>
            <p className="text-xs text-gray-500">@{space.slug}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{space.email}</td>
        <td className="px-4 py-3">
          <select
            value={space.plan}
            onChange={e => changePlan(e.target.value)}
            className="text-xs px-2 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
          >
            {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            value={limitInput}
            onChange={e => setLimitInput(e.target.value)}
            onBlur={commitMaxChatbots}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="—"
            title="Chatbots allowed — blank = inherit global, -1 = unlimited"
            className="w-16 text-xs px-2 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
          />
        </td>
        <td className="px-4 py-3">
          {space.active
            ? <Badge color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">Active</Badge>
            : <Badge color="bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">Inactive</Badge>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 text-center">{space.active_agents}/{space.agent_count}</td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 text-center">{space.message_count.toLocaleString()}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{new Date(space.created_at).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onConfigNav(space)}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-500 transition-colors"
              title="Settings"
            >
              <Layers className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
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
        <p className="text-sm text-gray-700 dark:text-gray-300">{agent.space_name}</p>
        <p className="text-xs text-gray-400">@{agent.space_slug}</p>
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

type Tab = 'overview' | 'spaces' | 'agents' | 'builtin' | 'activity' | 'vectordb' | 'nav' | 'homepage' | 'integrations'

// ── Builtin Agent Toggle Row ───────────────────────────────────────────────────

interface BuiltinAgentType {
  agent_type: string
  name: string
  icon: string
  slug: string
  platform_enabled: boolean
  locked?: boolean
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
          {agent.platform_enabled ? 'Enabled for all spaces' : 'Hidden from all spaces'}
        </span>
        {agent.locked && agent.platform_enabled ? (
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

// ── Nav Config ────────────────────────────────────────────────────────────────

const ALL_NAV_LABELS: Record<string, string> = {
  'dashboard':       'Dashboard',
  'chat':            'Chat',
  'agents':          'Agents',
  'knowledge-base':  'Knowledge Base',
  'analytics':       'Analytics',
  'evaluations':     'Evaluations',
  'inbox':           'Inbox',
  'chatbot-profile': 'Chatbot Profile',
  'data-sources':    'Data Sources',
  'integrations':    'Integrations',
  'settings':        'Settings',
}
const ALL_NAV_IDS = Object.keys(ALL_NAV_LABELS)

export function SpaceSettingsModal({ spaceId, spaceName, spaceSlug, adminKey, systemNav, platformDataSourcesEnabled, onViewChunks, onClose }: {
  spaceId: string; spaceName: string; spaceSlug: string; adminKey: string; systemNav: Record<string, boolean>;
  platformDataSourcesEnabled: boolean;
  onViewChunks: (clientId: string, docId: string, docName: string) => void;
  onClose: () => void
}) {
  const [spaceNavs, setSpaceNavs] = useState<string[] | null>(null)
  const [detail, setDetail] = useState<{ agents: Agent[], skills: any[], kb_docs: KbDoc[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataSourcesFeature, setDataSourcesFeature] = useState<SpaceDataSourcesFeatureState | null>(null)
  const [savingDataSources, setSavingDataSources] = useState(false)

  useEffect(() => {
    Promise.all([
      api(adminKey).get(`/spaces/${spaceId}/nav`),
      api(adminKey).get(`/orgs/${spaceId}`),
      api(adminKey).get(`/spaces/${spaceId}/data-sources-feature`)
    ]).then(([navData, orgData, featureData]) => {
      setSpaceNavs(navData.enabled_nav_items)
      setDetail({ agents: orgData.agents, skills: orgData.skills, kb_docs: orgData.kb_docs || [] })
      setDataSourcesFeature(featureData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [adminKey, spaceId])

  const updateDataSourcesOverride = async (rawValue: string) => {
    const override = rawValue === 'inherit' ? null : rawValue === 'enabled'
    setSavingDataSources(true)
    try {
      const data = await api(adminKey).patch(`/spaces/${spaceId}/data-sources-feature`, { override })
      setDataSourcesFeature(data)
    } finally {
      setSavingDataSources(false)
    }
  }

  const toggleSpaceItem = async (id: string) => {
    const current = spaceNavs ?? ALL_NAV_IDS
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    setSpaceNavs(next)
    await fetch(`${API}/spaces/${spaceId}/nav`, {
      method: 'PATCH',
      headers: { 'X-Super-Admin-Key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_nav_items: next }),
    })
  }

  const resetSpaceNav = async () => {
    setSpaceNavs(null)
    await fetch(`${API}/spaces/${spaceId}/nav`, {
      method: 'PATCH',
      headers: { 'X-Super-Admin-Key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_nav_items: null }),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Space Settings — {spaceName}</h3>
            <p className="text-sm text-gray-500 mt-0.5">@{spaceSlug}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {loading || !detail ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-10">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Data Sources feature</h4>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-500">Choose whether this space inherits or restricts the platform setting.</p>
                    <p className={`text-xs font-medium mt-1 ${dataSourcesFeature?.effective_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>
                      {!platformDataSourcesEnabled
                        ? 'Disabled by platform'
                        : dataSourcesFeature?.effective_enabled ? 'Effectively enabled' : 'Effectively disabled'}
                    </p>
                  </div>
                  <select
                    aria-label="Data Sources availability"
                    value={dataSourcesFeature?.override == null ? 'inherit' : dataSourcesFeature.override ? 'enabled' : 'disabled'}
                    onChange={e => updateDataSourcesOverride(e.target.value)}
                    disabled={savingDataSources || !dataSourcesFeature}
                    className="text-xs px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50"
                  >
                    <option value="inherit">Inherit platform setting</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
              
              {/* DETAILS SECTION */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Space Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agents ({detail.agents.length})</p>
                    <div className="space-y-2">
                      {detail.agents.map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-sm">
                          <span>{a.icon}</span>
                          <span className="text-gray-900 dark:text-gray-100 font-medium">{a.name}</span>
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Prompt Skills ({detail.skills.length})</p>
                    <div className="space-y-2">
                      {detail.skills.length === 0 && <p className="text-sm text-gray-400">No skills configured.</p>}
                      {detail.skills.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-900 dark:text-gray-100 font-medium">{s.name}</span>
                          <Badge color="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">{s.skill_type}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Knowledge Docs ({detail.kb_docs.length})</p>
                    <div className="space-y-3">
                      {detail.kb_docs.length === 0 && <p className="text-sm text-gray-400">No documents uploaded.</p>}
                      {detail.kb_docs.map(d => (
                        <div key={d.doc_id} className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="font-medium text-gray-900 dark:text-white">{d.doc_name || d.filename}</span>
                            <Badge color="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400">{d.doc_type}</Badge>
                            <button
                              onClick={() => {
                                onViewChunks(spaceSlug, d.doc_id, d.doc_name || d.filename);
                                onClose();
                              }}
                              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 hover:underline text-xs ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5" /> View chunks
                            </button>
                          </div>
                          <p className="text-gray-500 text-xs flex gap-3">
                            {d.kb_name && <span>KB: {d.kb_name}</span>}
                            {d.uploaded_at && <span>{new Date(d.uploaded_at).toLocaleDateString()}</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* NAV CONFIG SECTION */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Navigation Overrides</h4>
                <p className="text-xs text-gray-500 mb-3">Override which navigation items are visible for this space.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {ALL_NAV_IDS.map(id => {
                    const spaceItems = spaceNavs ?? ALL_NAV_IDS
                    const on = spaceItems.includes(id) && systemNav[id] !== false
                    return (
                      <button
                        key={id}
                        onClick={() => toggleSpaceItem(id)}
                        disabled={systemNav[id] === false}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          on
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'
                            : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        {ALL_NAV_LABELS[id]}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={resetSpaceNav}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                >
                  Reset to system defaults
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NavToggle({ label, enabled, locked, onChange }: {
  label: string; enabled: boolean; locked?: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-800 dark:text-gray-200">{label}</span>
      {locked ? (
        <span className="text-xs text-gray-400 italic">locked</span>
      ) : (
        <button
          onClick={() => onChange(!enabled)}
          className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
            enabled
              ? 'text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
          }`}
        >
          {enabled ? 'Disable' : 'Enable'}
        </button>
      )}
    </div>
  )
}

function NavConfigTab({ adminKey, systemNav, setSystemNav }: { adminKey: string; systemNav: Record<string, boolean>; setSystemNav: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const [saving, setSaving] = useState(false)

  const toggleSystem = async (id: string, val: boolean) => {
    const next = { ...systemNav, [id]: val }
    setSystemNav(next)
    setSaving(true)
    try {
      await fetch(`${API}/nav`, {
        method: 'PATCH',
        headers: { 'X-Super-Admin-Key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nav_config: { [id]: val } }),
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      {/* System-wide */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">System-wide Nav</p>
            <p className="text-xs text-gray-500 mt-0.5">Disabling an item hides it from every space.</p>
          </div>
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        {ALL_NAV_IDS.map(id => (
          <NavToggle
            key={id}
            label={ALL_NAV_LABELS[id]}
            enabled={systemNav[id] !== false}
            onChange={val => toggleSystem(id, val)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Homepage Config ──────────────────────────────────────────────────────────

function HomepageConfigTab({ adminKey }: { adminKey: string }) {
  const { activeHomepage, setActiveHomepage } = useAppStore()

  const setHomepageGlobal = async (val: 'homepage1' | 'homepage2' | 'homepage3' | 'homepage4' | 'homepage5') => {
    try {
      const res = await fetch(`${API_CONFIG.baseURL}/api/v1/super-admin/settings`, {
        method: 'PATCH',
        headers: {
          'X-Super-Admin-Key': adminKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active_homepage: val }),
      })
      const data = await res.json()
      if (data.active_homepage) {
        setActiveHomepage(data.active_homepage)
      }
    } catch (e) {
      console.error("Failed to update global homepage configuration:", e)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Active Homepage Selection</p>
          <p className="text-xs text-gray-500 mt-0.5">Select the active landing page layout displayed at the root route.</p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Card 1: Homepage 1 */}
          <button
            onClick={() => setHomepageGlobal('homepage1')}
            className={`flex flex-col text-left rounded-2xl border p-5 transition-all outline-none ${
              activeHomepage === 'homepage1'
                ? 'border-indigo-500 bg-indigo-50/10 ring-2 ring-indigo-500/20'
                : 'border-gray-200 dark:border-gray-700 bg-transparent hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Layout 1</span>
              {activeHomepage === 'homepage1' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500 text-white">Active</span>
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Homepage 1 (Classic Centered)</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
              Features a clean, centered typography layout, unified organization search, and a structured outline of capabilities and setup steps.
            </p>
            <div className="w-full h-32 rounded-xl bg-slate-950/80 border border-white/5 flex flex-col p-3 overflow-hidden select-none pointer-events-none">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[8px] font-bold text-white">SUPPORT247.chat</span>
                <span className="text-[7px] text-white px-2 py-0.5 rounded bg-indigo-600">Get Started</span>
              </div>
              <div className="flex flex-col items-center justify-center flex-grow text-center">
                <div className="w-16 h-1 bg-white/10 rounded mb-1" />
                <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-400 to-violet-400 rounded mb-2" />
                <div className="w-32 h-3.5 rounded bg-white/5 border border-white/10 flex items-center px-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500/20 flex items-center justify-center mr-1">
                    <span className="w-1 h-1 rounded-full bg-indigo-400" />
                  </div>
                  <div className="w-12 h-1 bg-white/10 rounded" />
                </div>
              </div>
            </div>
          </button>

          {/* Card 2: Homepage 2 */}
          <button
            onClick={() => setHomepageGlobal('homepage2')}
            className={`flex flex-col text-left rounded-2xl border p-5 transition-all outline-none ${
              activeHomepage === 'homepage2'
                ? 'border-indigo-500 bg-indigo-50/10 ring-2 ring-indigo-500/20'
                : 'border-gray-200 dark:border-gray-700 bg-transparent hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400">Layout 2</span>
              {activeHomepage === 'homepage2' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500 text-white">Active</span>
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Homepage 2 (Split Agent-Hub)</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
              Features a next-gen split design. Left side includes space search, and right side showcases animated floating active agent capsules.
            </p>
            <div className="w-full h-32 rounded-xl bg-slate-950/80 border border-white/5 flex p-3 overflow-hidden select-none pointer-events-none gap-3">
              <div className="w-1/2 flex flex-col justify-center">
                <div className="w-12 h-1 bg-white/10 rounded mb-1" />
                <div className="w-16 h-1.5 bg-gradient-to-r from-violet-400 to-indigo-400 rounded mb-2" />
                <div className="w-20 h-3 rounded bg-white/5 border border-white/10" />
              </div>
              <div className="w-1/2 border border-white/5 bg-white/2 rounded-lg relative flex flex-col items-center justify-center">
                <div className="absolute top-2 left-2 w-10 h-3 rounded bg-white/5 border border-white/10 flex items-center px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  <div className="w-5 h-0.5 bg-white/10 rounded" />
                </div>
                <div className="absolute bottom-2 right-2 w-10 h-3 rounded bg-white/5 border border-white/10 flex items-center px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  <div className="w-5 h-0.5 bg-white/10 rounded" />
                </div>
                <div className="w-6 h-6 rounded-full border border-violet-500/20 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                </div>
              </div>
            </div>
          </button>

          {/* Card 3: Homepage 3 */}
          <button
            onClick={() => setHomepageGlobal('homepage3')}
            className={`flex flex-col text-left rounded-2xl border p-5 transition-all outline-none ${
              activeHomepage === 'homepage3'
                ? 'border-pink-500 bg-pink-50/10 ring-2 ring-pink-500/20'
                : 'border-gray-200 dark:border-gray-700 bg-transparent hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-pink-500 dark:text-pink-400">Layout 3</span>
              {activeHomepage === 'homepage3' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-500 text-white">Active</span>
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Homepage 3 (Vibrant Light)</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
              Features an extremely colorful, light-themed responsive bento grid design showcasing floating specialized support capsules.
            </p>
            <div className="w-full h-32 rounded-xl bg-slate-50 border border-slate-200/50 flex p-3 overflow-hidden select-none pointer-events-none gap-3 shadow-inner">
              <div className="w-1/2 flex flex-col justify-center">
                <div className="w-12 h-1 bg-slate-200 rounded mb-1" />
                <div className="w-16 h-1.5 bg-gradient-to-r from-pink-400 to-amber-400 rounded mb-2" />
                <div className="w-20 h-3 rounded bg-white border border-slate-200" />
              </div>
              <div className="w-1/2 border border-slate-100 bg-white rounded-lg relative flex flex-col items-center justify-center shadow-sm">
                <div className="absolute top-2 left-2 w-10 h-3 rounded bg-indigo-500 text-white text-[5px] flex items-center px-1">
                  <div className="w-1 h-1 rounded-full bg-white mr-1 animate-pulse" />
                  <span className="scale-75 origin-left">triage</span>
                </div>
                <div className="absolute bottom-2 right-2 w-10 h-3 rounded bg-pink-500 text-white text-[5px] flex items-center px-1">
                  <div className="w-1 h-1 rounded-full bg-white mr-1 animate-pulse" />
                  <span className="scale-75 origin-left">support</span>
                </div>
              </div>
            </div>
          </button>

          {/* Card 4: Homepage 4 */}
          <button
            onClick={() => setHomepageGlobal('homepage4')}
            className={`flex flex-col text-left rounded-2xl border p-5 transition-all outline-none ${
              activeHomepage === 'homepage4'
                ? 'border-violet-500 bg-violet-50/10 ring-2 ring-violet-500/20'
                : 'border-gray-200 dark:border-gray-700 bg-transparent hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400">Layout 4</span>
              {activeHomepage === 'homepage4' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500 text-white">Active</span>
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Homepage 4 (Sunrise Light)</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
              Light-mode split hero with violet-to-teal gradients. Chat preview mockup on the right, bold stats strip, tinted feature cards.
            </p>
            <div className="w-full h-32 rounded-xl bg-white border border-slate-200/60 flex p-3 overflow-hidden select-none pointer-events-none gap-3 shadow-inner">
              <div className="w-1/2 flex flex-col justify-center gap-1.5">
                <div className="w-12 h-1 bg-slate-200 rounded" />
                <div className="w-20 h-2 bg-gradient-to-r from-violet-500 to-teal-400 rounded" />
                <div className="w-16 h-1 bg-slate-100 rounded" />
                <div className="w-20 h-3 rounded bg-gradient-to-r from-violet-500 to-teal-500 mt-1" />
              </div>
              <div className="w-1/2 border border-violet-100 bg-violet-50/30 rounded-lg flex flex-col p-1.5 gap-1 shadow-sm">
                <div className="w-full h-3 rounded bg-white border border-violet-100 flex items-center px-1 gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-300 flex-shrink-0" />
                  <div className="flex-1 h-0.5 bg-violet-100 rounded" />
                </div>
                <div className="w-3/4 h-3 rounded bg-white border border-violet-100 ml-auto flex items-center px-1">
                  <div className="flex-1 h-0.5 bg-teal-100 rounded" />
                </div>
                <div className="mt-auto w-full h-3 rounded bg-gradient-to-r from-violet-500 to-teal-400 flex items-center justify-center">
                  <div className="w-8 h-0.5 bg-white/70 rounded" />
                </div>
              </div>
            </div>
          </button>

          {/* Card 5: Homepage 5 */}
          <button
            onClick={() => setHomepageGlobal('homepage5')}
            className={`flex flex-col text-left rounded-2xl border p-5 transition-all outline-none ${
              activeHomepage === 'homepage5'
                ? 'border-fuchsia-500 bg-fuchsia-50/10 ring-2 ring-fuchsia-500/20'
                : 'border-gray-200 dark:border-gray-700 bg-transparent hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-500 dark:text-fuchsia-400">Layout 5</span>
              {activeHomepage === 'homepage5' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-fuchsia-500 text-white">Active</span>
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Homepage 5 (Redesigned)</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
              The latest and most premium homepage redesign with rich visual hierarchy.
            </p>
            <div className="w-full h-32 rounded-xl bg-white border border-slate-200/60 flex p-3 overflow-hidden select-none pointer-events-none gap-3 shadow-inner">
              <div className="w-full flex flex-col justify-center items-center gap-1.5">
                <div className="w-12 h-1 bg-slate-200 rounded" />
                <div className="w-20 h-2 bg-gradient-to-r from-fuchsia-500 to-rose-400 rounded" />
                <div className="w-16 h-1 bg-slate-100 rounded" />
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

interface VectorDBSpace {
  client_id: string
  space_name: string
  doc_count: number
  chunk_count: number
  docs: { doc_id: string; doc_name: string; doc_type: string; kb_name: string; uploaded_at: string; expires_at: string; chunk_count: number }[]
}

interface VectorDBData {
  summary: { policy_documents: number; product_catalog: number; client_documents: number; persist_dir: string }
  spaces: VectorDBSpace[]
}

export function SuperAdmin() {
  const [key, setKey] = useState('')
  const [usernameInput, setUsernameInput] = useState('admin')
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  const [stats, setStats] = useState<Stats | null>(null)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [builtinAgents, setBuiltinAgents] = useState<BuiltinAgentType[]>([])
  const [integrations, setIntegrations] = useState<IntegrationPackage[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [vectorDB, setVectorDB] = useState<VectorDBData | null>(null)
  const [expandedVecOrg, setExpandedVecOrg] = useState<string | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [viewingChunks, setViewingChunks] = useState<{ clientId: string; docId: string; docName: string } | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const SPACES_LIMIT = 15
  const ACTIVITY_LIMIT = 15
  const [spacesPage, setSpacesPage] = useState(0)
  const [spacesTotal, setSpacesTotal] = useState(0)
  const [activityPage, setActivityPage] = useState(0)
  const [activityTotal, setActivityTotal] = useState(0)
  const [navModalSpace, setNavModalSpace] = useState<Space | null>(null)
  const [systemNav, setSystemNav] = useState<Record<string, boolean>>({})
  const [dataSourcesPlatformEnabled, setDataSourcesPlatformEnabled] = useState<boolean | null>(null)

  const fetchSpaces = useCallback(async (k: string, page: number) => {
    setLoading(true)
    try {
      const o = await api(k).get(`/orgs?limit=${SPACES_LIMIT}&offset=${page * SPACES_LIMIT}`)
      setSpaces(o.orgs)
      setSpacesTotal(o.total)
      setSpacesPage(page)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchActivity = useCallback(async (k: string, page: number) => {
    setLoading(true)
    try {
      const l = await api(k).get(`/activity?limit=${ACTIVITY_LIMIT}&offset=${page * ACTIVITY_LIMIT}`)
      setLogs(l.logs)
      setActivityTotal(l.total)
      setActivityPage(page)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAll = useCallback(async (k: string) => {
    setLoading(true)
    setError('')
    try {
      const [s, o, a, l, navData, dataSourcesFeature] = await Promise.all([
        api(k).get('/stats'),
        api(k).get(`/orgs?limit=${SPACES_LIMIT}&offset=0`),
        api(k).get('/agents'),
        api(k).get(`/activity?limit=${ACTIVITY_LIMIT}&offset=0`),
        api(k).get('/nav').catch(() => ({ nav_config: {} })),
        api(k).get('/data-sources-feature'),
      ])
      setStats(s)
      setSpaces(o.orgs)
      setSpacesTotal(o.total)
      setSpacesPage(0)
      setAgents(a.agents)
      setLogs(l.logs)
      setActivityTotal(l.total)
      setActivityPage(0)
      setSystemNav(navData.nav_config || {})
      setDataSourcesPlatformEnabled(!!dataSourcesFeature.platform_enabled)
      // Non-fatal — /vectordb can 500 on a ChromaDB embedding-function conflict;
      // a broken VectorDB panel shouldn't blank the whole dashboard.
      api(k).get('/vectordb').then(setVectorDB).catch(() => {})
      // Non-fatal — requires migration 0015
      api(k).get('/builtin-agents').then(b => setBuiltinAgents(b.builtin_agents || [])).catch(() => {})
      // Integrations
      api(k).get('/integrations').then(i => setIntegrations(i.integrations || [])).catch(() => {})
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

  const filteredSpaces = spaces.filter(o =>
    !search || o.slug.includes(search.toLowerCase()) || o.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const filteredLogs = logs.filter(l =>
    !search || l.space_slug.includes(search.toLowerCase()) || l.message.toLowerCase().includes(search.toLowerCase())
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Username</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  placeholder="admin"
                  required
                  className={inputCls}
                />
              </div>
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
    { id: 'spaces',      label: 'Spaces',  icon: Users      },
    { id: 'agents',    label: 'Agents',         icon: Bot        },
    { id: 'builtin',   label: 'Built-in',       icon: Zap        },
    { id: 'activity',  label: 'Activity',       icon: Activity   },
    { id: 'vectordb',  label: 'Vector DB',      icon: HardDrive  },
    { id: 'nav',       label: 'Nav Config',     icon: Layers     },
    { id: 'homepage',  label: 'Homepage',       icon: HomeIcon   },
    { id: 'integrations', label: 'Integrations',icon: Blocks     },
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
          <StatCard icon={Users}         label="Total Spaces"       value={stats.total_orgs}      sub={`${stats.active_orgs} active`}          color="bg-indigo-500" />
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
      {(tab === 'spaces' || tab === 'activity') && (
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'spaces' ? 'Search spaces…' : 'Search logs…'}
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
              const count = spaces.filter(o => o.plan === plan).length
              const pct = spaces.length ? Math.round(count / spaces.length * 100) : 0
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
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Top Spaces by Messages</p>
            <div className="space-y-2.5">
              {[...spaces].sort((a, b) => b.message_count - a.message_count).slice(0, 6).map(o => (
                <div key={o.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{o.display_name}</p>
                    <p className="text-xs text-gray-400">@{o.slug}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{o.message_count.toLocaleString()} msgs</span>
                </div>
              ))}
              {spaces.length === 0 && <p className="text-xs text-gray-400">No spaces yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Organizations ── */}
      {tab === 'spaces' && (
        <div>
          <ChatbotLimitsControl adminKey={key} />
          <HomepageSectionsPlatformControl adminKey={key} />
          <DataSourcesPlatformControl
            adminKey={key}
            value={dataSourcesPlatformEnabled}
            onChange={setDataSourcesPlatformEnabled}
          />
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                  {['Organization', 'Email', 'Plan', 'Chatbots', 'Status', 'Agents', 'Messages', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSpaces.map(space => (
                  <SpaceRow key={space.id} space={space} adminKey={key} onRefresh={() => fetchAll(key)}
                    onViewChunks={(cid, did, name) => setViewingChunks({ clientId: cid, docId: did, docName: name })}
                    onConfigNav={(s) => setNavModalSpace(s)} />
                ))}
                {filteredSpaces.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">No spaces found.</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
              <span className="text-xs text-gray-500">
                Showing {spacesTotal === 0 ? 0 : spacesPage * SPACES_LIMIT + 1} to {Math.min((spacesPage + 1) * SPACES_LIMIT, spacesTotal)} of {spacesTotal}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={spacesPage === 0}
                  onClick={() => fetchSpaces(key, spacesPage - 1)}
                  className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={(spacesPage + 1) * SPACES_LIMIT >= spacesTotal}
                  onClick={() => fetchSpaces(key, spacesPage + 1)}
                  className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
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
              <p className="px-4 py-8 text-center text-sm text-gray-400">No built-in agents found. Make sure at least one space exists.</p>
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

      {/* ── Integrations ── */}
      {tab === 'integrations' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Toggling an integration off hides it from the Integrations tab for all tenants.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {integrations.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No integration packages found.</p>
            )}
            {integrations.map(pkg => (
              <div key={pkg.slug} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div className="flex items-center gap-3">
                  {pkg.icon_url ? (
                    <img src={pkg.icon_url} alt={pkg.name} className="w-6 h-6 object-contain" />
                  ) : (
                    <Blocks className="w-6 h-6 text-gray-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{pkg.name}</p>
                    <p className="text-xs text-gray-400">@{pkg.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${pkg.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                    {pkg.is_active ? 'Active globally' : 'Disabled'}
                  </span>
                  <button
                    onClick={async () => {
                      const prev = [...integrations];
                      setIntegrations(integrations.map(p => p.slug === pkg.slug ? { ...p, is_active: !pkg.is_active } : p));
                      try {
                        await fetch(`${API}/integrations/${pkg.slug}`, {
                          method: 'PATCH',
                          headers: { 'X-Super-Admin-Key': key, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ is_active: !pkg.is_active }),
                        });
                      } catch (err) {
                        setIntegrations(prev);
                      }
                    }}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                      pkg.is_active
                        ? 'text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    }`}
                  >
                    {pkg.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Nav Config ── */}
      {tab === 'nav' && <NavConfigTab adminKey={key} systemNav={systemNav} setSystemNav={setSystemNav} />}

      {/* ── Homepage Config ── */}
      {tab === 'homepage' && <HomepageConfigTab adminKey={key} />}

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
              <p className="mt-2"># Filter by space (client_id = space UUID)</p>
              <p>{'col.get(where={"client_id": {"$eq": "<space-uuid>"}}, include=["metadatas"])'}</p>
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

              {/* Per-space breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Client Documents — per space</p>
                </div>
                {(vectorDB.spaces ?? []).length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">No client documents in vector DB.</p>
                )}
                {(vectorDB.spaces ?? []).map(o => (
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
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{o.space_name || 'Unknown space'}</p>
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
                {['Time', 'Space', 'Role', 'Message', 'Agent', 'Intent', 'ms'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">@{l.space_slug}</p>
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
              <span className="text-xs text-gray-500">
                Showing {activityTotal === 0 ? 0 : activityPage * ACTIVITY_LIMIT + 1} to {Math.min((activityPage + 1) * ACTIVITY_LIMIT, activityTotal)} of {activityTotal}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={activityPage === 0}
                  onClick={() => fetchActivity(key, activityPage - 1)}
                  className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={(activityPage + 1) * ACTIVITY_LIMIT >= activityTotal}
                  onClick={() => fetchActivity(key, activityPage + 1)}
                  className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
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

      {/* Space Settings Modal */}
      {navModalSpace && (
        <SpaceSettingsModal
          spaceId={navModalSpace.id}
          spaceName={navModalSpace.display_name}
          spaceSlug={navModalSpace.slug}
          adminKey={key}
          systemNav={systemNav}
          platformDataSourcesEnabled={dataSourcesPlatformEnabled === true}
          onViewChunks={(cid, did, name) => setViewingChunks({ clientId: cid, docId: did, docName: name })}
          onClose={() => setNavModalSpace(null)}
        />
      )}
    </div>
  )
}
