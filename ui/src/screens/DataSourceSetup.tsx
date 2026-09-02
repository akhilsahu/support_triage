import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Edit3, Eye, Loader2, Plus, Plug, Server, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import { DataSourceWizard } from '../features/data-sources/DataSourceWizard'
import type { FleetAgent } from '../features/data-sources/types'
import { DataSourceDetailsModal } from '../features/data-sources/DataSourceDetailsModal'

interface DataSourceCard { id: string; name: string; apiUrl: string; authType: string; method: string; active: boolean; connection: any; tool: any }

export function DataSourceSetup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const chatbotId = useAppStore(state => state.currentChatbotId)
  const [sources, setSources] = useState<DataSourceCard[]>([])
  const [agents, setAgents] = useState<FleetAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(Boolean(params.get('agent')))
  const [selected, setSelected] = useState<{ source: DataSourceCard; mode: 'view' | 'edit' } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [connections, tools, availableAgents] = await Promise.all([
        apiClient.listDataSourceConnections(), apiClient.listDataSourceTools(), apiClient.listOrgAgents(chatbotId),
      ])
      const byConnection = new Map(connections.map((item: any) => [item.id, item]))
      setAgents(availableAgents)
      setSources(tools.map((tool: any) => {
        const connection: any = byConnection.get(tool.connection_id) || {}
        return { id: tool.id, name: tool.display_name || tool.name, apiUrl: `${connection.base_url || ''}${tool.path || ''}`, authType: connection.auth_type || 'none', method: tool.method, active: tool.status === 'active', connection, tool }
      }))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [chatbotId])

  const closeWizard = () => {
    if (window.location.pathname.startsWith('/app/agents/datasource')) navigate('/app/agents')
    else setAdding(false)
  }

  if (loading) return <div className="flex min-h-[300px] flex-col items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /><p className="text-xs text-gray-500">Loading data sources…</p></div>
  return <><div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
    <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4"><div><h2 className="text-sm font-semibold text-gray-900 dark:text-white">Data Sources</h2><p className="mt-1 text-xs text-gray-500">{sources.length} external connection{sources.length === 1 ? '' : 's'} configured</p></div><Button onClick={() => setAdding(true)} size="sm"><Plus className="h-4 w-4" /> Add data source</Button></header>
    {!sources.length ? <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-800 p-12 text-center"><Plug className="mx-auto mb-3 h-8 w-8 text-indigo-500" /><h3 className="text-sm font-semibold">No data sources connected</h3><p className="mx-auto mt-1 mb-5 max-w-sm text-xs text-gray-500">Connect a REST API so assigned agents can retrieve live information.</p><Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add data source</Button></div>
      : <div className="grid gap-4 md:grid-cols-2">{sources.map(source => <article key={source.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-2 text-indigo-600"><Server className="h-4 w-4" /></span><h3 className="truncate text-xs font-semibold">{source.name}</h3></div><span className={`rounded px-2 py-1 text-[10px] font-bold ${source.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{source.active ? 'ACTIVE' : 'INACTIVE'}</span></div><div className="my-3 rounded-lg bg-gray-50 dark:bg-gray-950 p-3 font-mono text-[11px]"><strong className="text-indigo-600">{source.method}</strong><p className="mt-1 break-all text-gray-500">{source.apiUrl}</p></div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800"><span className="text-[10px] text-gray-500">Auth: {source.authType.toUpperCase()}</span><div className="flex items-center gap-1"><button onClick={() => setSelected({ source, mode: 'view' })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><Eye className="h-3.5 w-3.5" />View</button><button onClick={() => setSelected({ source, mode: 'edit' })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"><Edit3 className="h-3.5 w-3.5" />Edit</button><button onClick={async () => { if (!confirm('Disable this data source tool?')) return; await apiClient.updateDataSourceTool(source.id, { status: 'disabled' }); await load() }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" />Disable</button></div></div></article>)}</div>}
  </div>{adding && <DataSourceWizard chatbotId={chatbotId} agents={agents} onCancel={closeWizard} onComplete={async () => { await load(); closeWizard() }} />}{selected && <DataSourceDetailsModal connection={selected.source.connection} tool={selected.source.tool} initialMode={selected.mode} onClose={() => setSelected(null)} onSaved={load} />}</>
}
