import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { Plus, X, Lock, ChevronRight, ChevronDown, FileText, Database, Trash2, CheckCircle, Settings2, Loader2, Bot, MessageCircle, Sparkles } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Toggle } from '../components/ui/Toggle'
import { getAgentTheme } from '../config/theme'
import { apiClient } from '../api/client'
import { ModelControls } from '../components/ModelControls'
import type { ModelEffort } from '../components/ModelControls'
import { motion, AnimatePresence } from 'framer-motion'

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
  kb_ids: string[]
  kb_assignments?: { kb_id: string; doc_ids: string[] }[]
  llm_model: string | null
  reasoning_effort: string | null
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

/** Mirrors the server's name-derived slug (app/api/v1/space_agents.py). */
function slugPreview(name: string): string {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').slice(0, 40).replace(/^_+|_+$/g, '')
}



// ── KB Selector Accordion ─────────────────────────────────────────────────────

function KBSelectorAccordion({
  allKBs,
  selectedKbIds,
  kbAssignments,
  onChangeKbIds,
  onChangeAssignments,
}: {
  allKBs: { id: string; name: string; item_count: number }[]
  selectedKbIds: string[]
  kbAssignments: Record<string, string[]>
  onChangeKbIds: (ids: string[]) => void
  onChangeAssignments: (assignments: Record<string, string[]>) => void
}) {
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null)
  const [kbItemsMap, setKbItemsMap] = useState<Record<string, any[]>>({})
  const [loadingKbId, setLoadingKbId] = useState<string | null>(null)

  const toggleExpand = async (kbId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (expandedKbId === kbId) {
      setExpandedKbId(null)
      return
    }
    setExpandedKbId(kbId)
    if (!kbItemsMap[kbId]) {
      setLoadingKbId(kbId)
      try {
        const res = await apiClient.listKBItems(kbId)
        const itemsList = Array.isArray(res) ? res : (res?.items || [])
        setKbItemsMap(prev => ({ ...prev, [kbId]: itemsList }))

        // If KB is checked and no specific docs set, select all docs
        if (selectedKbIds.includes(kbId) && (!kbAssignments[kbId] || kbAssignments[kbId].length === 0)) {
          const allDocIds = itemsList.map((item: any) => item.doc_id || item.indexed_doc_id || item.id)
          onChangeAssignments({ ...kbAssignments, [kbId]: allDocIds })
        }
      } catch (err) {
        console.error('Failed to load KB items:', err)
      } finally {
        setLoadingKbId(null)
      }
    }
  }

  const handleKbCheckbox = async (kbId: string) => {
    const isChecked = selectedKbIds.includes(kbId)
    if (isChecked) {
      // Uncheck KB and clear all assignments for this KB
      onChangeKbIds(selectedKbIds.filter(id => id !== kbId))
      const next = { ...kbAssignments }
      delete next[kbId]
      onChangeAssignments(next)
    } else {
      // Check KB checkbox
      onChangeKbIds([...selectedKbIds, kbId])

      // Auto-check all documents in this KB
      let items = kbItemsMap[kbId]
      if (!items) {
        setLoadingKbId(kbId)
        try {
          const res = await apiClient.listKBItems(kbId)
          items = Array.isArray(res) ? res : (res?.items || [])
          setKbItemsMap(prev => ({ ...prev, [kbId]: items }))
        } catch (err) {
          console.error('Failed to load KB items:', err)
          items = []
        } finally {
          setLoadingKbId(null)
        }
      }
      const allDocIds = items.map(item => item.doc_id || item.indexed_doc_id || item.id)
      onChangeAssignments({ ...kbAssignments, [kbId]: allDocIds })
    }
  }

  const getItemIds = (item: any): string[] => {
    return [item.doc_id, item.indexed_doc_id, item.id].filter(Boolean)
  }

  const handleDocCheckbox = (kbId: string, item: any, items: any[]) => {
    const itemIds = getItemIds(item)
    const primaryId = item.doc_id || item.indexed_doc_id || item.id
    const allDocIds = items.map(i => i.doc_id || i.indexed_doc_id || i.id)
    const isKbChecked = selectedKbIds.includes(kbId)
    const assignedDocs = kbAssignments[kbId]
    const currentDocs = (assignedDocs && assignedDocs.length > 0) ? assignedDocs : (isKbChecked ? allDocIds : [])

    const isDocCurrentlyChecked = currentDocs.some(id => itemIds.includes(id))
    const nextDocs = isDocCurrentlyChecked
      ? currentDocs.filter(d => !itemIds.includes(d))
      : [...currentDocs, primaryId]

    if (nextDocs.length > 0) {
      // At least 1 doc selected -> ensure KB is in selectedKbIds
      if (!selectedKbIds.includes(kbId)) {
        onChangeKbIds([...selectedKbIds, kbId])
      }
    } else {
      // 0 docs selected -> remove KB from selectedKbIds
      if (selectedKbIds.includes(kbId)) {
        onChangeKbIds(selectedKbIds.filter(id => id !== kbId))
      }
    }

    onChangeAssignments({ ...kbAssignments, [kbId]: nextDocs })
  }

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
      {allKBs.map(kb => {
        const isExpanded = expandedKbId === kb.id
        const items = kbItemsMap[kb.id] || []
        const assignedDocs = kbAssignments[kb.id]
        const isSelected = selectedKbIds.includes(kb.id)
        const hasItems = items.length > 0
        const hasAssignedDocs = !!(assignedDocs && assignedDocs.length > 0)

        const isAllDocsSelected = hasItems && hasAssignedDocs && assignedDocs.length === items.length
        const isExplicitEntireKb = isSelected && !hasAssignedDocs
        const isEntireKb = isExplicitEntireKb || isAllDocsSelected
        const isPartialSelection = !isEntireKb && hasAssignedDocs

        const allDocIds = items.map(item => item.doc_id || item.indexed_doc_id || item.id)
        const currentDocIds = isEntireKb ? allDocIds : (assignedDocs || [])

        return (
          <div key={kb.id} className="border border-gray-200 dark:border-gray-700/70 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
            <div className="flex items-center justify-between px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors">
              <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={isEntireKb}
                  onChange={() => handleKbCheckbox(kb.id)}
                  className="accent-indigo-600 w-3.5 h-3.5 flex-shrink-0"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{kb.name}</span>
              </label>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isEntireKb && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                    Entire KB
                  </span>
                )}
                {isPartialSelection && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    {assignedDocs!.length}{hasItems ? `/${items.length}` : ''} Doc{assignedDocs!.length > 1 ? 's' : ''} Selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={e => toggleExpand(kb.id, e)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 transition-colors"
                  title="Expand to pick specific documents"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-3 py-2 bg-gray-50/70 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                {loadingKbId === kb.id ? (
                  <p className="text-[11px] text-gray-400 italic flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading files…</p>
                ) : items.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">No document items in this knowledge base.</p>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-500 font-medium mb-1">
                      Check specific files to scope this agent (checking all files automatically ticks Entire KB):
                    </p>
                    {items.map(item => {
                      const itemIds = getItemIds(item)
                      const isDocChecked = currentDocIds.some(id => itemIds.includes(id))
                      return (
                        <label key={item.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isDocChecked}
                            onChange={() => handleDocCheckbox(kb.id, item, items)}
                            className="accent-indigo-600 w-3 h-3 flex-shrink-0"
                          />
                          <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{item.title || item.doc_label || item.filename || 'Document'}</span>
                        </label>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>

        )
      })}
    </div>
  )
}




// ── Advanced Settings Collapsible ─────────────────────────────────────────────

function AdvancedSettingsCollapsible({
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  ragTopK,
  setRagTopK,
  modelEffort,
  setModelEffort,
  setModelTouched,
}: {
  temperature: number
  setTemperature: (v: number) => void
  maxTokens: number
  setMaxTokens: (v: number) => void
  ragTopK: number
  setRagTopK: (v: number) => void
  modelEffort: ModelEffort
  setModelEffort: (v: ModelEffort) => void
  setModelTouched?: (v: boolean) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border border-gray-200 dark:border-gray-700/80 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-800/30 transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 text-left hover:bg-gray-100/60 dark:hover:bg-gray-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Advanced Settings</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Temperature, Max Tokens, Top K & Reasoning Effort</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
            {maxTokens} tok · K:{ragTopK} · T:{temperature.toFixed(1)}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900/60">
          {/* 1. Temperature */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Temperature <span className="font-mono text-indigo-600 dark:text-indigo-400 ml-1">{temperature.toFixed(1)}</span>
              </label>
              <span className="text-[11px] text-gray-400">
                {temperature <= 0.2 ? 'Deterministic' : temperature <= 0.6 ? 'Balanced' : 'Creative'}
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 font-mono">
              <span>0.0 (Strict)</span>
              <span>0.5 (Balanced)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          {/* 2. Max Response Length (tokens) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Max Response Length (tokens)
            </label>
            <input
              type="number"
              min={50}
              max={4000}
              step={50}
              value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value) || 500)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 font-mono text-xs"
            />
            <p className="text-[11px] text-gray-400 mt-1">~75 words per 100 tokens. Default: 500.</p>
          </div>

          {/* 3. Top Retrieval Results (Top K) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Top Retrieval Results (Top K) <span className="font-mono text-indigo-600 dark:text-indigo-400 ml-1">{ragTopK}</span>
              </label>
              <span className="text-[11px] text-gray-400">
                {ragTopK <= 3 ? 'Narrow & Precise' : ragTopK <= 8 ? 'Balanced' : 'Broad Search'}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={ragTopK}
              onChange={e => setRagTopK(parseInt(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 font-mono">
              <span>1 (Narrow)</span>
              <span>5 (Standard)</span>
              <span>20 (Broad)</span>
            </div>
          </div>

          {/* 4. Reasoning Effort */}
          <div>
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Reasoning effort</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Optional. Off means no reasoning tokens; Inherit uses this chatbot's default.</p>
            </div>
            <ModelControls
              value={modelEffort}
              inheritLabel="Inherit chatbot default"
              onChange={v => {
                setModelEffort(v)
                setModelTouched?.(true)
              }}
              showModel={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}


// ── Prompt Edit Modal ─────────────────────────────────────────────────────────

function PromptModal({ agent, docTypes, chatbotSlug, onClose, onSaved }: {
  agent: OrgAgent
  docTypes: string[]
  chatbotSlug?: string | null
  onClose: () => void
  onSaved: (updated: OrgAgent) => void
}) {
  const [agentName, setAgentName] = useState(agent.name ?? '')
  const [slug, setSlug] = useState(agent.slug ?? '')
  const [description, setDescription] = useState(agent.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt ?? '')
  const [temperature, setTemperature] = useState(agent.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(agent.max_tokens ?? 500)
  const [ragEnabled, setRagEnabled] = useState(agent.rag_enabled ?? false)
  const [ragDocTypes, setRagDocTypes] = useState<string[]>(agent.rag_doc_types ?? [])
  const [ragTopK, setRagTopK] = useState(agent.rag_top_k ?? 5)
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>(agent.kb_ids ?? [])
  const [kbAssignments, setKbAssignments] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    if (agent.kb_assignments) {
      agent.kb_assignments.forEach(asgn => {
        map[asgn.kb_id] = asgn.doc_ids || []
      })
    }
    return map
  })
  const [allKBs, setAllKBs] = useState<{ id: string; name: string; item_count: number }[]>([])
  const [modelEffort, setModelEffort] = useState<ModelEffort>({ model: null, effort: agent.reasoning_effort ?? null })
  const [modelTouched, setModelTouched] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiClient.listKBs()
      .then(d => setAllKBs(d || []))
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (agent.id && !agent.is_builtin) {
      apiClient.getOrgAgent(agent.id).then((fullAgent: OrgAgent) => {
        if (fullAgent) {
          if (fullAgent.kb_ids?.length) {
            setSelectedKbIds(fullAgent.kb_ids)
          }
          if (fullAgent.kb_assignments && fullAgent.kb_assignments.length > 0) {
            const map: Record<string, string[]> = {}
            fullAgent.kb_assignments.forEach((asgn: { kb_id: string; doc_ids: string[] }) => {
              map[asgn.kb_id] = asgn.doc_ids || []
            })
            setKbAssignments(map)
          }
        }
      }).catch(() => { })
    }
  }, [agent.id])

  const handleAutoGeneratePrompt = async () => {
    setGeneratingPrompt(true)
    setError('')
    try {
      if (agent.slug === 'triage') {
        if (!chatbotSlug) {
          setError('No active chatbot selected.')
          return
        }
        const res = await apiClient.generateTriagePrompt(chatbotSlug)
        if (res?.generated_prompt) {
          setSystemPrompt(res.generated_prompt)
        }
      } else {
        const res = await apiClient.generateAgentPrompt(agent.id)
        if (res?.generated_prompt) {
          setSystemPrompt(res.generated_prompt)
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to auto-generate prompt.')
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const payloadAssignments = selectedKbIds.map(id => ({
        kb_id: id,
        doc_ids: kbAssignments[id] || []
      }))

      const updated = await apiClient.updateOrgAgent(agent.id, {
        name: agentName.trim() || undefined,
        slug: slug.trim() || undefined,
        description,
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens,
        rag_enabled: ragEnabled,
        rag_doc_types: ragDocTypes,
        rag_top_k: ragTopK,
        kb_ids: selectedKbIds,
        kb_assignments: payloadAssignments,
        // Only send the effort override when the admin touched it, so saving
        // unrelated fields never silently resets an existing override.
        ...(modelTouched
          ? { reasoning_effort: modelEffort.effort }
          : {}),
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
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col"
    >
      <motion.div 
        layoutId={agent.id || agent.slug}
        className="w-full h-full max-w-4xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-xl shadow-xs">
              {agent.icon || '🤖'}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">{agent.name} Settings</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-normal">Customize routing rules, capabilities and AI parameters</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0">

          {/* Section 1: Basic Information */}
          {!agent.is_builtin && (
            <div className="p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-gray-50/40 dark:bg-gray-800/20 space-y-6">
              <Input
                label="Agent Name"
                required
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
              />

              <Input
                label="Slug (routing key)"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="lowercase_letters_numbers"
                hint="URL-safe identifier used for triage routing."
              />

              <Textarea
                label="Description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Short description of what this agent handles (used for triage routing)"
              />
            </div>
          )}

          {/* Section 2: System Prompt */}
          <div className="p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-gray-50/40 dark:bg-gray-800/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">System Instructions</label>
                <p className="text-xs text-gray-400 mt-0.5">Role, tone, boundaries and response guidelines</p>
              </div>
              <button
                type="button"
                onClick={handleAutoGeneratePrompt}
                disabled={generatingPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
              >
                {generatingPrompt ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> Generating…</>
                ) : (
                  <>{agent.slug === 'triage' ? '✨ Auto-Generate Instructions' : '✨ Auto-Generate Agent Instructions'}</>
                )}
              </button>
            </div>

            <Textarea
              label="System Instructions"
              hint="Role, tone, boundaries and response guidelines"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={8}
              placeholder={`You are a ${agent.name.toLowerCase()} for [Your Company]...`}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-xs text-indigo-500/90 dark:text-indigo-400/90 font-medium flex items-center gap-1.5">
              <span>🔒</span> Platform safety rules and guardrails are enforced.
            </p>
          </div>

          {/* Section 3: Knowledge Base (RAG) */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800/80 overflow-hidden bg-gray-50/40 dark:bg-gray-800/20">
            <div className="flex items-center justify-between px-5 py-4 bg-gray-100/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800/60">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">Knowledge Base (RAG)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ground answers using your uploaded space documents</p>
              </div>
              <Toggle checked={ragEnabled} onChange={setRagEnabled} />
            </div>

            {ragEnabled && (
              <div className="p-5 space-y-4">
                {/* Knowledge Bases */}
                {!agent.is_builtin && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2">
                      Knowledge Bases
                      <span className="ml-2 text-gray-400 font-normal normal-case">— select entire KB or specific files</span>
                    </label>
                    {allKBs.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No knowledge bases found.</p>
                    ) : (
                      <KBSelectorAccordion
                        allKBs={allKBs}
                        selectedKbIds={selectedKbIds}
                        kbAssignments={kbAssignments}
                        onChangeKbIds={setSelectedKbIds}
                        onChangeAssignments={setKbAssignments}
                      />
                    )}
                    {selectedKbIds.length > 0 && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-1.5">
                        ✓ {selectedKbIds.length} Knowledge Base{selectedKbIds.length > 1 ? 's' : ''} connected
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Advanced Settings Collapsible */}
          <AdvancedSettingsCollapsible
            temperature={temperature}
            setTemperature={setTemperature}
            maxTokens={maxTokens}
            setMaxTokens={setMaxTokens}
            ragTopK={ragTopK}
            setRagTopK={setRagTopK}
            modelEffort={modelEffort}
            setModelEffort={setModelEffort}
            setModelTouched={setModelTouched}
          />

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-3 rounded-xl font-medium">{error}</p>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose} className="px-5 py-2 text-sm font-medium rounded-xl">Cancel</Button>
          <Button onClick={save} disabled={saving || (!agent.is_builtin && !agentName.trim())} loading={saving} className="px-6 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Create Custom Agent Modal ─────────────────────────────────────────────────

export function CreateAgentModal({ onClose, onCreated, prefill }: {
  onClose: () => void
  onCreated: (agent?: OrgAgent) => void
  prefill?: { name?: string; docType?: string; docId?: string; kb_ids?: string[] }
}) {
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(prefill?.name || '')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.4)
  const [maxTokens, setMaxTokens] = useState(500)
  const [ragEnabled, setRagEnabled] = useState(!!(prefill?.docType || prefill?.kb_ids?.length))
  const [ragDocTypes, setRagDocTypes] = useState<string[]>(prefill?.docType ? [prefill.docType] : [])
  const [ragTopK, setRagTopK] = useState(5)
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>(prefill?.kb_ids || [])
  const [kbAssignments, setKbAssignments] = useState<Record<string, string[]>>({})
  const [allKBs, setAllKBs] = useState<{ id: string; name: string; item_count: number }[]>([])
  const [modelEffort, setModelEffort] = useState<ModelEffort>({ model: null, effort: '' })
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionId, setSuggestionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const currentChatbotId = useAppStore(s => s.currentChatbotId)

  const inputCls = 'w-full px-4 py-2.5 text-sm bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-xl focus:bg-white dark:focus:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 transition-all font-sans'

  useEffect(() => {
    apiClient.listOrgDocTypes().then(d => setDocTypes(d.doc_types || [])).catch(() => { })
    apiClient.listKBs().then(d => setAllKBs(d || [])).catch(() => { })
  }, [])

  // Auto-generate when opened with prefilled doc type or KBs
  useEffect(() => {
    if (prefill?.docType || prefill?.kb_ids?.length) {
      handleGenerate(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async (force = false) => {
    if (!name.trim()) {
      setError('Please enter an Agent Name first to auto-generate system instructions.')
      nameInputRef.current?.focus()
      return
    }
    setSuggesting(true)
    setError('')
    try {
      const activeDocIds = selectedKbIds.flatMap(id => kbAssignments[id] || []).filter(Boolean)
      const data = await apiClient.generateAgentSuggestion(
        ragDocTypes,
        prefill?.docId,
        force || !!suggestionId,
        name.trim() || undefined,
        selectedKbIds,
        activeDocIds
      )
      if (force || !name.trim()) setName(data.name || name)
      if (force || !description) setDescription(data.description || '')
      if (force || !systemPrompt) setSystemPrompt(data.system_prompt || '')
      setSuggestionId(data.suggestion_id)
    } catch {
      setError('Could not generate suggestions. Fill in manually.')
    } finally {
      setSuggesting(false)
    }
  }

  const handleGenerateClick = () => {
    if (!name.trim()) {
      setError('Please enter an Agent Name first to auto-generate system instructions.')
      nameInputRef.current?.focus()
      return
    }
    setError('')
    handleGenerate(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payloadAssignments = selectedKbIds.map(id => ({
        kb_id: id,
        doc_ids: kbAssignments[id] || []
      }))

      const agent = await apiClient.createOrgAgent({
        name: name.trim(),
        description,
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens,
        rag_enabled: ragEnabled,
        rag_doc_types: ragDocTypes,
        rag_top_k: ragTopK,
        kb_ids: selectedKbIds,
        kb_assignments: payloadAssignments,
        slug: slug.trim() || undefined,
        llm_model: modelEffort.model ?? undefined,
        reasoning_effort: modelEffort.effort ?? undefined,
      }, currentChatbotId)
      // Link suggestion → agent so cache knows this suggestion was used
      if (suggestionId && agent?.id) {
        apiClient.linkSuggestionToAgent(suggestionId, agent.id).catch(() => { })
      }
      onCreated(agent)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col"
    >
      <motion.div 
        layoutId="create-agent"
        className="w-full h-full max-w-4xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800"
      >
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
              🤖
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Create Custom Agent</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configure persona, system instructions, and knowledge base</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0">

          {/* Section 1: Basic Information */}
          <div className="p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-gray-50/40 dark:bg-gray-800/20 space-y-6">
            <Input
              label="Agent Name"
              required
              ref={nameInputRef}
              value={name}
              onChange={e => { setName(e.target.value); if (error) setError('') }}
              placeholder="e.g., Policy Agent, Billing Specialist…"
              autoFocus
            />

            <Input
              label="Slug (optional routing key)"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder={slugPreview(name)}
              hint="URL-safe identifier for triage routing. Leave blank to auto-generate from the name."
              className="font-mono text-xs"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">Description</label>
                <button
                  type="button"
                  onClick={handleGenerateClick}
                  disabled={suggesting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
                >
                  {suggesting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> Generating…</>
                  ) : (
                    <>{suggestionId ? '↻ Regenerate Prompt' : '✨ Auto-fill Prompt'}</>
                  )}
                </button>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="What does this agent handle? (used for triage routing)"
                className={`${inputCls} resize-y leading-relaxed`}
              />
              <p className="text-xs text-gray-400 mt-1.5">Triage uses this description to decide when customer queries route here.</p>
            </div>
          </div>

          {/* Section 2: System Prompt */}
          <div className="p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-gray-50/40 dark:bg-gray-800/20 space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">System Instructions</label>
              <p className="text-xs text-gray-400 mb-2">Instructions, persona, tone, and specific guidance for this custom agent</p>
            </div>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
              placeholder="You are a specialized support agent who helps customers with…"
              rows={5} className={`${inputCls} resize-y font-mono text-xs leading-relaxed`} />
          </div>

          {/* Section 3: Knowledge Base (RAG) */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800/80 overflow-hidden bg-gray-50/40 dark:bg-gray-800/20">
            <div className="flex items-center justify-between px-5 py-4 bg-gray-100/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800/60">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">Knowledge Base (RAG)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Let this agent search and answer directly from uploaded space documents</p>
              </div>
              <Toggle checked={ragEnabled} onChange={setRagEnabled} />
            </div>
            {ragEnabled && (
              <div className="p-5 space-y-4">

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2">
                    Knowledge Bases
                    <span className="ml-2 text-gray-400 font-normal normal-case">— select entire KB or specific files</span>
                  </label>
                  {allKBs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No knowledge bases created yet.</p>
                  ) : (
                    <KBSelectorAccordion
                      allKBs={allKBs}
                      selectedKbIds={selectedKbIds}
                      kbAssignments={kbAssignments}
                      onChangeKbIds={setSelectedKbIds}
                      onChangeAssignments={setKbAssignments}
                    />
                  )}
                </div>

                {selectedKbIds.length > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                        {selectedKbIds.length} Knowledge Base{selectedKbIds.length > 1 ? 's' : ''} connected
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateClick}
                      disabled={suggesting}
                      className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white underline cursor-pointer disabled:opacity-50"
                    >
                      {suggesting ? 'Re-generating…' : 'Re-generate prompt with KB context →'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Advanced Settings Collapsible */}
          <AdvancedSettingsCollapsible
            temperature={temperature}
            setTemperature={setTemperature}
            maxTokens={maxTokens}
            setMaxTokens={setMaxTokens}
            ragTopK={ragTopK}
            setRagTopK={setRagTopK}
            modelEffort={modelEffort}
            setModelEffort={setModelEffort}
          />

          {suggestionId && !suggesting && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1.5 px-1">
              <span>✓</span> Auto-filled parameters based on your selected knowledge base · feel free to edit
            </p>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-3 rounded-xl font-medium">{error}</p>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose} className="px-5 py-2 text-sm font-medium rounded-xl">Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || saving || suggesting}
            loading={saving}
            className="px-6 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            Create Agent
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main Agents screen ────────────────────────────────────────────────────────

export function Agents() {
  const navigate = useNavigate()
  const spaceSlug = useAppStore(s => s.spaceSlug)
  const currentChatbotId = useAppStore(s => s.currentChatbotId)
  const setCurrentChatbotId = useAppStore(s => s.setCurrentChatbotId)
  const [agents, setAgents] = useState<OrgAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<OrgAgent | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [saved, setSaved] = useState(false)

  // Triage Router sync notification banner state
  const [triageBanner, setTriageBanner] = useState<string | null>(null)
  const [autoGeneratingTriage, setAutoGeneratingTriage] = useState(false)
  const [autoGenerateSuccess, setAutoGenerateSuccess] = useState(false)

  // Human transfer settings (chatbot-level)
  const [chatbotSlug, setChatbotSlug] = useState<string | null>(null)
  const [humanTransfer, setHumanTransfer] = useState(true)
  const [transferMessage, setTransferMessage] = useState("You're being connected to a human agent. Please hold on.")
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferSaved, setTransferSaved] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  // Ask-the-customer toggle (chatbot-level) -- default off, same precedent as
  // human transfer: "how much may this bot involve someone else in the
  // conversation?" See docs/ambiguous-question-clarification-plan.md.
  const [clarifyEnabled, setClarifyEnabled] = useState(false)

  // Guards against a race that produced the exact symptom of "doesn't load,
  // requests fail": the sidebar independently resolves/corrects
  // currentChatbotId on mount (e.g. a stale id left over from another space,
  // or a since-deleted chatbot). If this effect fires first with that stale
  // id, the backend correctly 404s. loadSeq lets a slow/stale response never
  // overwrite what a newer request already set; the 404 branch below recovers
  // by clearing the bad id instead of surfacing an error for what's actually
  // a transient, self-correcting state.
  const loadSeq = useRef(0)

  const loadAgents = async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    setLoadError(false)
    try {
      const data = await apiClient.listOrgAgents(currentChatbotId)
      if (seq !== loadSeq.current) return   // a newer request already resolved
      setAgents(data)
      setLoading(false)
    } catch (e: any) {
      if (seq !== loadSeq.current) return
      if (e?.response?.status === 404 && currentChatbotId) {
        // Stale/invalid chatbot selection -- fall back to the space's default
        // instead of showing an error; the effect below re-fires on the change.
        setCurrentChatbotId(null)
        return
      }
      setLoadError(true)
      setLoading(false)
    }
  }

  const loadChatbotSettings = async () => {
    try {
      const bots = await apiClient.getChatbots()
      const bot = bots?.find((b: any) => b.id === currentChatbotId) ?? bots?.find((b: any) => b.is_default) ?? bots?.[0]
      if (bot) {
        setChatbotSlug(bot.slug)
        setHumanTransfer(bot.human_transfer_enabled ?? true)
        setTransferMessage(bot.human_transfer_message || "You're being connected to a human agent. Please hold on.")
        setClarifyEnabled(bot.clarify_enabled ?? false)
      }
    } catch { }
  }

  const saveTransferSettings = async () => {
    if (!chatbotSlug) return
    setSavingTransfer(true)
    try {
      await apiClient.updateChatbot(chatbotSlug, {
        human_transfer_enabled: humanTransfer,
        human_transfer_message: transferMessage,
        clarify_enabled: clarifyEnabled,
      })
      setTransferSaved(true)
      setTimeout(() => setTransferSaved(false), 2000)
    } catch { }
    finally { setSavingTransfer(false) }
  }

  useEffect(() => {
    loadAgents()
    loadChatbotSettings()
  }, [currentChatbotId])

  useEffect(() => {
    apiClient.listDataSources().then(setDataSources).catch(() => { })
    apiClient.listOrgDocTypes().then(d => setDocTypes(d.doc_types || [])).catch(() => { })
  }, [])

  const handleAutoGenerateTriageFromBanner = async () => {
    if (!chatbotSlug) return
    setAutoGeneratingTriage(true)
    try {
      const res = await apiClient.generateTriagePrompt(chatbotSlug)
      if (res?.generated_prompt) {
        const triageAgent = agents.find(a => a.slug === 'triage')
        if (triageAgent) {
          const updated = await apiClient.updateOrgAgent(triageAgent.id, { system_prompt: res.generated_prompt })
          setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
        }
        setAutoGenerateSuccess(true)
        setTimeout(() => {
          setAutoGenerateSuccess(false)
          setTriageBanner(null)
        }, 3000)
      }
    } catch (err) {
      console.error("Failed to auto-generate triage prompt:", err)
    } finally {
      setAutoGeneratingTriage(false)
    }
  }

  const handleToggle = async (agent: OrgAgent, val: boolean) => {
    if (agent.slug === 'triage') return
    try {
      const updated = await apiClient.updateOrgAgent(agent.id, { active: val }, currentChatbotId)
      setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
      setTriageBanner(`Specialist agent "${agent.name}" active status was changed.`)
    } catch { /* show error if needed */ }
  }

  const handleAgentSaved = (updated: OrgAgent) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    if (updated.slug !== 'triage') {
      setTriageBanner(`Specialist agent "${updated.name}" settings were updated.`)
    }
  }

  const handleDeleteAgent = async (agent: OrgAgent) => {
    if (!confirm(`Delete "${agent.name}"?`)) return
    try {
      await apiClient.deleteOrgAgent(agent.id)
      setAgents(prev => prev.filter(a => a.id !== agent.id))
      if (agent.slug !== 'triage') {
        setTriageBanner(`Specialist agent "${agent.name}" was deleted.`)
      }
    } catch { /* ignore */ }
  }

  const handleDeleteDs = async (id: string) => {
    if (!confirm('Delete this data source?')) return
    await apiClient.deleteDataSource(id)
    apiClient.listDataSources().then(setDataSources).catch(() => { })
  }

  const builtinAgents = agents.filter(a => a.is_builtin)
  const customAgents = agents.filter(a => !a.is_builtin)

  return (
    <div className="p-6 space-y-6">


      {/* ── Transfer to Human modal ── */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Transfer to Human</h3>
                <p className="text-xs text-gray-400 mt-0.5">Triage agent escalation settings</p>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Enable auto-escalation</p>
                  <p className="text-xs text-gray-400 mt-0.5">Triage agent hands off unresolved chats to a human</p>
                </div>
                <button
                  onClick={() => setHumanTransfer(v => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200
                    ${humanTransfer ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                    ${humanTransfer ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {humanTransfer && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Handoff message shown to customer
                  </label>
                  <input
                    value={transferMessage}
                    onChange={e => setTransferMessage(e.target.value)}
                    placeholder="e.g. Connecting you with a human agent…"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Shown when AI escalates or customer clicks "Talk to a human".</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ask which product they mean</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    When an agent covers 2+ products and can't tell which one the customer has, ask instead of guessing or answering for both.
                  </p>
                </div>
                <button
                  onClick={() => setClarifyEnabled(v => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200
                    ${clarifyEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                    ${clarifyEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
            <div className="px-5 pb-5 flex items-center gap-3">
              <button
                onClick={async () => { await saveTransferSettings(); setShowTransferModal(false) }}
                disabled={savingTransfer || !chatbotSlug}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-colors"
              >
                {savingTransfer ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                Cancel
              </button>
              {transferSaved && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-auto">
                  <CheckCircle className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Built-in Agents</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Toggle on/off · customize prompts and knowledge base</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Test Chat */}
          <button
            onClick={() => navigate('/app/agents/test')}
            title="Test your chatbot"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Test Chat
          </button>

          {/* Transfer to Human settings icon */}
          <button
            onClick={() => setShowTransferModal(true)}
            title="Transfer to Human settings"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${humanTransfer
                ? 'border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Human Handoff
            <span className={`w-1.5 h-1.5 rounded-full ${humanTransfer ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
          </button>
        </div>
        {saved && (
          <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </div>
        )}
      </div>

      {/* ── Triage Router Notification Banner ── */}
      {triageBanner && (
        <div className="p-4 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-200/90 dark:border-indigo-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950 dark:text-indigo-100">
                Triage Routing Alert: {triageBanner}
              </p>
              <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                Specialist capabilities changed. Auto-generate or edit the Triage Agent's prompt to sync the updated context.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {autoGenerateSuccess ? (
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                <CheckCircle className="w-3.5 h-3.5" /> Prompt Updated!
              </span>
            ) : (
              <>
                <button
                  onClick={handleAutoGenerateTriageFromBanner}
                  disabled={autoGeneratingTriage || !chatbotSlug}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {autoGeneratingTriage ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Auto-Generating…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Auto-Generate Triage Prompt</>
                  )}
                </button>
                <button
                  onClick={() => {
                    const triageAgent = agents.find(a => a.slug === 'triage')
                    if (triageAgent) setEditingAgent(triageAgent)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Open Triage Agent
                </button>
              </>
            )}
            <button
              onClick={() => setTriageBanner(null)}
              className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/50 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading agents…
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Couldn't load your agents. Please check your connection and try again.
          </p>
          <Button size="sm" onClick={loadAgents}>Retry</Button>
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
                <Card key={agent.slug} layoutId={agent.id || agent.slug} className="p-5 flex flex-col">
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
                        <span key={dt} className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs rounded font-medium">{dt}</span>
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
                                <span className={`w-1.5 h-1.5 rounded-full ${ds.active ? 'bg-indigo-400' : 'bg-gray-300'}`} />
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
              <motion.button 
                layoutId="create-agent"
                onClick={() => setShowCreateModal(true)} 
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Create Agent
              </motion.button>
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
                  <Card key={agent.id} layoutId={agent.id || agent.slug} className="p-5 flex flex-col">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center text-lg shrink-0">
                          {agent.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{agent.name}</p>
                          <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Custom</Badge>
                        </div>
                      </div>
                      <Toggle checked={agent.active} size="sm" onChange={v => handleToggle(agent, v)} />
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{agent.description || 'No description'}</p>

                    {agent.rag_enabled && (
                      <div className="mb-2">
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] rounded-md font-medium">
                          ⚡ RAG Search Active
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <button onClick={() => setEditingAgent(agent)}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium whitespace-nowrap">
                        <Settings2 className="w-3.5 h-3.5" /> Settings
                      </button>
                      <button onClick={() => setEditingAgent(agent)}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium whitespace-nowrap">
                        <Database className="w-3.5 h-3.5" />
                        KBs {agent.kb_ids?.length > 0 && <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 rounded-full">{agent.kb_ids.length}</span>}
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

      <AnimatePresence>
        {editingAgent && (
          <PromptModal
            agent={editingAgent}
            docTypes={docTypes}
            chatbotSlug={chatbotSlug}
            onClose={() => setEditingAgent(null)}
            onSaved={handleAgentSaved}
          />
        )}
      </AnimatePresence>


      <AnimatePresence>
        {showCreateModal && (
          <CreateAgentModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(newAgent) => {
              loadAgents()
              setSaved(true)
              setTimeout(() => setSaved(false), 2500)
              setTriageBanner(`New specialist agent "${newAgent?.name || 'custom agent'}" was created.`)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
