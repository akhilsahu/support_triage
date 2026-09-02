import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, Plus, Search, X } from 'lucide-react'

import {
  apiClient,
  type AgentDataSourceTool,
  type AgentKind,
} from '../../api/client'
import { Button } from '../../components/ui/Button'

export interface DataSourceToolPickerProps {
  agent: { id: string; name: string; is_builtin: boolean }
  chatbotId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
  onCreateSource: () => void
}

function errorMessage(value: unknown): string {
  const error = value as { response?: { data?: { detail?: string } }; message?: string }
  return error.response?.data?.detail || error.message || 'Could not load data source tools.'
}

export function DataSourceToolPicker({
  agent,
  chatbotId,
  onClose,
  onSaved,
  onCreateSource,
}: DataSourceToolPickerProps) {
  const agentKind: AgentKind = agent.is_builtin ? 'builtin' : 'custom'
  const [tools, setTools] = useState<AgentDataSourceTool[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTools = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.listAgentDataSourceTools(agentKind, agent.id, chatbotId)
      setTools(response.tools)
      setSelectedIds(new Set(response.tools.filter(tool => tool.assigned).map(tool => tool.id)))
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setLoading(false)
    }
  }, [agent.id, agentKind, chatbotId])

  useEffect(() => { void loadTools() }, [loadTools])

  const filteredTools = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return tools
    return tools.filter(tool => [tool.display_name, tool.name, tool.connection_name, tool.method, tool.path]
      .some(value => value.toLocaleLowerCase().includes(needle)))
  }, [query, tools])

  const toggleTool = (toolId: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(toolId)) next.delete(toolId)
      else next.add(toolId)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await apiClient.replaceAgentDataSourceTools(agentKind, agent.id, {
        chatbot_id: chatbotId,
        tool_ids: Array.from(selectedIds),
      })
      await onSaved()
      onClose()
    } catch (value) {
      setError(errorMessage(value))
      const status = (value as { response?: { status?: number } }).response?.status
      if (status === 422) await loadTools()
    } finally {
      setSaving(false)
    }
  }

  const createSource = () => {
    onClose()
    onCreateSource()
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="datasource-tool-picker-title" className="flex max-h-[88vh] w-[min(680px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/40"><Database className="h-5 w-5" /></span><div><h2 id="datasource-tool-picker-title" className="text-base font-bold">Plug data sources into {agent.name}</h2><p className="mt-0.5 text-xs text-gray-500">Choose the active tools this agent can use.</p></div></div>
        <button type="button" aria-label="Close" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span>{!loading && <Button size="sm" variant="secondary" onClick={() => void loadTools()}>Retry</Button>}</div>}
        {loading ? <div role="status" className="py-12 text-center text-sm text-gray-500">Loading data source tools…</div> : <>
          {tools.length > 0 && <label className="relative mb-4 block"><span className="sr-only">Search data source tools</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tools, connections, methods, or paths" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-950" /></label>}
          {tools.length === 0 ? <div className="py-10 text-center"><p className="font-semibold">No active data source tools</p><p className="mt-1 text-sm text-gray-500">Create and activate a data source before plugging it into this agent.</p></div> : filteredTools.length === 0 ? <div className="py-10 text-center"><p className="font-semibold">No tools match your search</p><p className="mt-1 text-sm text-gray-500">Try a connection name, HTTP method, or path.</p></div> : <div className="space-y-2">{filteredTools.map(tool => <label key={tool.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-gray-700 dark:hover:bg-indigo-950/20"><input aria-label={tool.display_name || tool.name} type="checkbox" checked={selectedIds.has(tool.id)} onChange={() => toggleTool(tool.id)} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{tool.display_name || tool.name}</span><span className="mt-1 block text-xs text-gray-500">{tool.connection_name}</span><span className="mt-2 block truncate font-mono text-xs"><strong className="mr-2 text-indigo-600">{tool.method}</strong>{tool.path}</span></span></label>)}</div>}
        </>}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
        <Button variant="ghost" onClick={createSource} disabled={saving}><Plus className="h-4 w-4" />Create new data source</Button>
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving} disabled={loading || Boolean(error)}>Save assignments</Button></div>
      </footer>
    </div>
  </div>
}
