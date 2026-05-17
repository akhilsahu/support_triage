import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Lock, ChevronRight, Database, Trash2, CheckCircle, Settings2, Loader2, Bot } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { getAgentTheme } from '../config/theme'
import { apiClient } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgAgent {
  id: string
  slug: string
  name: string
  description: string
  agent_type: string
  icon: string
  is_builtin: boolean
  active: boolean
  system_prompt: string
  temperature: number
  max_tokens: number
  rag_enabled: boolean
  rag_doc_types: string[]
  rag_top_k: number
  keywords: string[]
  doc_ids: string[]
}

interface DataSource {
  id: string
  name: string
  agent_type: string
  api_url: string
  auth_type: string
  field_mapping: Record<string, string | null>
  active: boolean
  created_at: string
}

// ── Doc Type Chips ─────────────────────────────────────────────────────────────

function DocTypeChips({
  selected,
  available,
  onChange,
}: {
  selected: string[]
  available: string[]
  onChange: (v: string[]) => void
}) {
  const toggle = (dt: string) =>
    onChange(selected.includes(dt) ? selected.filter(d => d !== dt) : [...selected, dt])

  const all = Array.from(new Set([...available, ...selected]))

  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map(dt => (
        <button
          key={dt}
          onClick={() => toggle(dt)}
          type="button"
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            selected.includes(dt)
              ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-indigo-300'
              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
          }`}
        >
          {dt}
        </button>
      ))}
      {all.length === 0 && (
        <p className="text-xs text-gray-400 italic">No document types in your knowledge base yet.</p>
      )}
    </div>
  )
}

// ── Prompt Edit Modal ─────────────────────────────────────────────────────────

function PromptModal({ agent, docTypes, onClose, onSaved }: {
  agent: OrgAgent
  docTypes: string[]
  onClose: () => void
  onSaved: (updated: OrgAgent) => void
}) {
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)
  const [temperature, setTemperature]   = useState(agent.temperature)
  const [maxTokens, setMaxTokens]       = useState(agent.max_tokens)
  const [ragEnabled, setRagEnabled]     = useState(agent.rag_enabled)
  const [ragDocTypes, setRagDocTypes]   = useState<string[]>(agent.rag_doc_types)
  const [ragTopK, setRagTopK]           = useState(agent.rag_top_k)
  const [linkedDocIds, setLinkedDocIds] = useState<string[]>(agent.doc_ids || [])
  const [allDocs, setAllDocs]           = useState<{ doc_id: string; filename: string; doc_type: string }[]>([])
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400'

  useEffect(() => {
    apiClient.listDocs()
      .then(data => setAllDocs(data.documents || data || []))
      .catch(() => {})
  }, [])

  const toggleDoc = (docId: string) =>
    setLinkedDocIds(prev => prev.includes(docId) ? prev.filter(d => d !== docId) : [...prev, docId])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await apiClient.updateOrgAgent(agent.id, {
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens,
        rag_enabled: ragEnabled,
        rag_doc_types: ragDocTypes,
        rag_top_k: ragTopK,
        doc_ids: linkedDocIds,
      })
      onSaved(updated)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{agent.icon}</span>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{agent.name} — Settings</h3>
              <p className="text-xs text-gray-500 mt-0.5">Customize this agent's behavior</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* System prompt */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">System Prompt</label>
            <p className="text-xs text-gray-400 mb-2">
              Describe this agent's role, tone, and any specific instructions.
            </p>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={6}
              placeholder={`You are a ${agent.name.toLowerCase()} for [Your Company]...`}
              className={`${inputCls} resize-none font-mono text-xs leading-relaxed`}
            />
            <p className="text-xs text-indigo-500 mt-1 flex items-center gap-1">
              🔒 Platform safety rules are always enforced.
            </p>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Temperature <span className="font-mono text-indigo-600 dark:text-indigo-400">{temperature.toFixed(1)}</span>
              </label>
              <span className="text-xs text-gray-400">
                {temperature <= 0.2 ? 'Very focused' : temperature <= 0.4 ? 'Focused' : temperature <= 0.6 ? 'Balanced' : temperature <= 0.8 ? 'Creative' : 'Very creative'}
              </span>
            </div>
            <input type="range" min={0} max={1} step={0.1} value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0.0 — precise</span><span>1.0 — creative</span>
            </div>
          </div>

          {/* Max tokens */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Max Response Length (tokens)</label>
            <input type="number" min={50} max={4000} step={50} value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value) || 500)}
              className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">~75 words per 100 tokens.</p>
          </div>

          {/* RAG */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Knowledge Base (RAG)</p>
                <p className="text-xs text-gray-400 mt-0.5">Agent answers from your uploaded documents</p>
              </div>
              <Toggle checked={ragEnabled} onChange={setRagEnabled} />
            </div>

            {ragEnabled && (
              <div className="px-3 py-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Document Types to Search
                  </label>
                  <DocTypeChips selected={ragDocTypes} available={docTypes} onChange={setRagDocTypes} />
                  {ragDocTypes.length === 0 && (
                    <p className="text-xs text-amber-500 mt-1">Select at least one doc type.</p>
                  )}
                </div>

                {/* Linked Docs */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Linked Documents
                    <span className="ml-1.5 text-gray-400 font-normal">— pin specific docs to this agent</span>
                  </label>
                  {allDocs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No documents uploaded yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {allDocs.map(doc => (
                        <label key={doc.doc_id}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <input
                            type="checkbox"
                            checked={linkedDocIds.includes(doc.doc_id)}
                            onChange={() => toggleDoc(doc.doc_id)}
                            className="accent-indigo-600 w-3.5 h-3.5 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                            {doc.filename}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{doc.doc_type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {linkedDocIds.length > 0 && (
                    <p className="text-xs text-indigo-500 mt-1">{linkedDocIds.length} doc{linkedDocIds.length > 1 ? 's' : ''} linked</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Top K results <span className="font-mono text-indigo-600">{ragTopK}</span>
                  </label>
                  <input type="range" min={1} max={20} step={1} value={ragTopK}
                    onChange={e => setRagTopK(parseInt(e.target.value))}
                    className="w-full accent-indigo-600" />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>1 — narrow</span><span>20 — broad</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={save} disabled={saving || (ragEnabled && ragDocTypes.length === 0)} loading={saving} className="flex-1">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Create Custom Agent Modal ─────────────────────────────────────────────────

export function CreateAgentModal({ onClose, onCreated, prefill }: {
  onClose: () => void
  onCreated: () => void
  prefill?: { name?: string; docType?: string; docId?: string }
}) {
  const [name, setName]               = useState(prefill?.name || '')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [ragEnabled, setRagEnabled]   = useState(!!prefill?.docType)
  const [ragDocTypes, setRagDocTypes] = useState<string[]>(prefill?.docType ? [prefill.docType] : [])
  const [ragTopK, setRagTopK]         = useState(5)
  const [docTypes, setDocTypes]       = useState<string[]>([])
  const [saving, setSaving]           = useState(false)
  const [suggesting, setSuggesting]   = useState(false)
  const [suggestionId, setSuggestionId] = useState<string | null>(null)
  const [error, setError]             = useState('')

  const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400'

  useEffect(() => {
    apiClient.listOrgDocTypes().then(d => setDocTypes(d.doc_types || [])).catch(() => {})
  }, [])

  // Auto-generate suggestion when modal opens with a prefilled doc type
  useEffect(() => {
    if (prefill?.docType) {
      handleGenerate([prefill.docType], prefill.docId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async (types?: string[], docId?: string, force = false) => {
    const target = types ?? ragDocTypes
    if (!target.length) return
    const targetDocId = docId ?? prefill?.docId
    setSuggesting(true)
    setError('')
    try {
      const data = await apiClient.generateAgentSuggestion(target, targetDocId, force)
      // Only pre-fill fields the user hasn't touched yet
      if (!name || name === prefill?.name) setName(data.name)
      if (!description) setDescription(data.description)
      if (!systemPrompt) setSystemPrompt(data.system_prompt)
      setSuggestionId(data.suggestion_id)
    } catch {
      setError('Could not generate suggestions. Fill in manually.')
    } finally {
      setSuggesting(false)
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const agent = await apiClient.createOrgAgent({
        name: name.trim(),
        description,
        system_prompt: systemPrompt,
        rag_enabled: ragEnabled,
        rag_doc_types: ragDocTypes,
        rag_top_k: ragTopK,
        doc_ids: prefill?.docId ? [prefill.docId] : [],
      })
      // Link suggestion → agent so cache knows this suggestion was used
      if (suggestionId && agent?.id) {
        apiClient.linkSuggestionToAgent(suggestionId, agent.id).catch(() => {})
      }
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Create Custom Agent</h3>
            <p className="text-xs text-gray-500 mt-0.5">Scoped to your org · Triage will route to it automatically</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Agent Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g., Policy Agent" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this agent handle? (used for routing)" className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Triage uses this to decide when to route customers here.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">System Prompt</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
              placeholder="You are a specialized support agent who helps with..."
              rows={3} className={`${inputCls} resize-none font-mono text-xs`} />
          </div>

          {/* RAG */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Knowledge Base (RAG)</p>
                <p className="text-xs text-gray-400 mt-0.5">Answers from your uploaded documents</p>
              </div>
              <Toggle checked={ragEnabled} onChange={setRagEnabled} />
            </div>
            {ragEnabled && (
              <div className="px-3 py-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Document Types</label>
                    {ragDocTypes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleGenerate(undefined, undefined, !!suggestionId)}
                        disabled={suggesting}
                        className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 disabled:opacity-50 font-medium"
                      >
                        {suggesting
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                          : <>✨ {suggestionId ? 'Re-generate' : 'Generate suggestions'}</>
                        }
                      </button>
                    )}
                  </div>
                  <DocTypeChips selected={ragDocTypes} available={docTypes} onChange={setRagDocTypes} />
                  {ragDocTypes.length === 0 && (
                    <p className="text-xs text-amber-500 mt-1">Select doc types, then generate suggestions.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Top K <span className="font-mono text-indigo-600">{ragTopK}</span>
                  </label>
                  <input type="range" min={1} max={20} step={1} value={ragTopK}
                    onChange={e => setRagTopK(parseInt(e.target.value))}
                    className="w-full accent-indigo-600" />
                </div>
              </div>
            )}
          </div>

          {suggesting && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin flex-shrink-0" />
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                Analysing your knowledge base and generating suggestions…
              </span>
            </div>
          )}

          {suggestionId && !suggesting && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              ✓ Fields pre-filled from your knowledge base · edit as needed
            </p>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || saving || suggesting || (ragEnabled && ragDocTypes.length === 0)}
            loading={saving}
            className="flex-1"
          >
            Create Agent
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Agents screen ────────────────────────────────────────────────────────

export function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents]             = useState<OrgAgent[]>([])
  const [loading, setLoading]           = useState(true)
  const [dataSources, setDataSources]   = useState<DataSource[]>([])
  const [docTypes, setDocTypes]         = useState<string[]>([])
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<OrgAgent | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [saved, setSaved]               = useState(false)

  const loadAgents = async () => {
    try {
      const data = await apiClient.listOrgAgents()
      setAgents(data)
    } catch { /* backend down */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadAgents()
    apiClient.listDataSources().then(setDataSources).catch(() => {})
    apiClient.listOrgDocTypes().then(d => setDocTypes(d.doc_types || [])).catch(() => {})
  }, [])

  const handleToggle = async (agent: OrgAgent, val: boolean) => {
    if (agent.slug === 'triage') return
    try {
      const updated = await apiClient.updateOrgAgent(agent.id, { active: val })
      setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
    } catch { /* show error if needed */ }
  }

  const handleAgentSaved = (updated: OrgAgent) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleDeleteAgent = async (agent: OrgAgent) => {
    if (!confirm(`Delete "${agent.name}"?`)) return
    try {
      await apiClient.deleteOrgAgent(agent.id)
      setAgents(prev => prev.filter(a => a.id !== agent.id))
    } catch { /* ignore */ }
  }

  const handleDeleteDs = async (id: string) => {
    if (!confirm('Delete this data source?')) return
    await apiClient.deleteDataSource(id)
    apiClient.listDataSources().then(setDataSources).catch(() => {})
  }

  const builtinAgents = agents.filter(a => a.is_builtin)
  const customAgents  = agents.filter(a => !a.is_builtin)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Built-in Agents</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Toggle on/off · customize prompts and knowledge base</p>
        </div>
        {saved && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading agents…
        </div>
      ) : (
        <>
          {/* Built-in agents */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {builtinAgents.map(agent => {
              const t = getAgentTheme(agent.name)
              const isLocked = agent.slug === 'triage'
              const agentDs = dataSources.filter(d => d.agent_type === agent.agent_type)
              const isExpanded = expandedAgent === agent.slug

              return (
                <Card key={agent.slug} className="p-5">
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${t.bg}`}>
                        {agent.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{agent.name}</p>
                          {isLocked && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
                        </div>
                        <Badge className="mt-0.5">Built-in</Badge>
                      </div>
                    </div>
                    <Toggle checked={agent.active} onChange={v => handleToggle(agent, v)} disabled={isLocked} />
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">{agent.description}</p>

                  {agent.rag_enabled && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {agent.rag_doc_types.map(dt => (
                        <span key={dt} className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs rounded font-medium">{dt}</span>
                      ))}
                    </div>
                  )}

                  {isLocked && (
                    <p className="mb-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Always active — required for routing
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-auto pt-2">
                    <button onClick={() => setEditingAgent(agent)}
                      className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium whitespace-nowrap">
                      <Settings2 className="w-3.5 h-3.5" /> Settings
                    </button>
                    <button onClick={() => setEditingAgent(agent)}
                      className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium whitespace-nowrap">
                      <Database className="w-3.5 h-3.5" />
                      KB Docs {agent.doc_ids?.length > 0 && <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 rounded-full">{agent.doc_ids.length}</span>}
                    </button>
                  </div>

                  {!isLocked && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <button onClick={() => setExpandedAgent(isExpanded ? null : agent.slug)}
                        className="flex items-center justify-between w-full text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors">
                        <span className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5" />
                          Data Sources {agentDs.length > 0 && `(${agentDs.length})`}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {agentDs.length === 0 && <p className="text-xs text-gray-400 italic">No data source connected.</p>}
                          {agentDs.map(ds => (
                            <div key={ds.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                              <div>
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{ds.name}</p>
                                <p className="text-xs text-gray-400 truncate max-w-[160px]">{ds.api_url}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${ds.active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                                <button onClick={() => handleDeleteDs(ds.id)} className="p-1 text-red-400 hover:text-red-600">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => navigate(`/agents/datasource?agent=${agent.agent_type}`)}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 mt-1">
                            <Plus className="w-3 h-3" /> Connect data source
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Custom agents */}
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Custom Agents</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Triage routes to them automatically · each can cover one or more document types
                </p>
              </div>
              <Button size="sm" onClick={() => setShowCreateModal(true)} className="shrink-0">
                <Plus className="w-3.5 h-3.5" /> Create Agent
              </Button>
            </div>

            {customAgents.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No custom agents yet</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Create one per doc type (e.g. Policy Agent, Tech Support Agent) or one that covers all.
                </p>
                <Button size="sm" variant="secondary" onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-3.5 h-3.5" /> Create your first agent
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {customAgents.map(agent => (
                  <Card key={agent.id} className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center text-lg shrink-0">
                          {agent.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{agent.name}</p>
                          <Badge variant="success">Custom</Badge>
                        </div>
                      </div>
                      <Toggle checked={agent.active} size="sm" onChange={v => handleToggle(agent, v)} />
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{agent.description || 'No description'}</p>

                    {agent.rag_enabled && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {agent.rag_doc_types.map(dt => (
                          <span key={dt} className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs rounded font-medium">{dt}</span>
                        ))}
                        {agent.rag_doc_types.length === 0 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs rounded">RAG on · no types</span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <button onClick={() => setEditingAgent(agent)}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium whitespace-nowrap">
                        <Settings2 className="w-3.5 h-3.5" /> Settings
                      </button>
                      <button onClick={() => setEditingAgent(agent)}
                        className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium whitespace-nowrap">
                        <Database className="w-3.5 h-3.5" />
                        KB Docs {agent.doc_ids?.length > 0 && <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 rounded-full">{agent.doc_ids.length}</span>}
                      </button>
                      <button onClick={() => handleDeleteAgent(agent)}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium whitespace-nowrap">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {editingAgent && (
        <PromptModal
          agent={editingAgent}
          docTypes={docTypes}
          onClose={() => setEditingAgent(null)}
          onSaved={handleAgentSaved}
        />
      )}

      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { loadAgents(); setSaved(true); setTimeout(() => setSaved(false), 2500) }}
        />
      )}
    </div>
  )
}
