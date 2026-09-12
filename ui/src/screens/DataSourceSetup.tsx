import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Edit3, Eye, Loader2, Plus, Plug, Server, Trash2, Search, Sparkles, ChevronDown, Code2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import { DataSourceWizard } from '../features/data-sources/DataSourceWizard'
import { PresetPickerModal } from '../features/data-sources/PresetPickerModal'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [addingMode, setAddingMode] = useState<'presets' | 'custom' | null>(params.get('agent') ? 'presets' : null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selected, setSelected] = useState<{ source: DataSourceCard; mode: 'view' | 'edit' } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const closeWizard = () => {
    if (window.location.pathname.startsWith('/app/agents/datasource')) navigate('/app/agents')
    else setAddingMode(null)
  }

  const filteredSources = sources.filter(source => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      source.name.toLowerCase().includes(q) ||
      source.apiUrl.toLowerCase().includes(q) ||
      source.method.toLowerCase().includes(q) ||
      source.authType.toLowerCase().includes(q)
    )
  })

  if (loading) return <div className="flex min-h-[300px] flex-col items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /><p className="text-xs text-gray-500">Loading data sources…</p></div>

  return <>
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Data Sources</h1>
          <p className="mt-1 text-xs text-gray-500">
            {sources.length} external connection{sources.length === 1 ? '' : 's'} configured for agent live retrieval
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search data sources..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="relative inline-block text-left" ref={dropdownRef}>
            <Button onClick={() => setDropdownOpen(prev => !prev)} size="sm" className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" /> Add data source <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl bg-white dark:bg-gray-900 p-2 shadow-2xl border border-gray-200 dark:border-gray-800 z-50 animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => { setDropdownOpen(false); setAddingMode('presets') }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-start gap-3 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      ⚡ Inbuilt Presets
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                      WooCommerce, WordPress, Shopify, Stripe, Zendesk
                    </div>
                  </div>
                </button>

                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                <button
                  type="button"
                  onClick={() => { setDropdownOpen(false); setAddingMode('custom') }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 flex items-start gap-3 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 group-hover:scale-105 transition-transform">
                    <Code2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">
                      🛠️ Custom REST API
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                      Connect custom endpoint with AI, URL probe, or cURL
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!sources.length ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-800 p-12 text-center">
          <Plug className="mx-auto mb-3 h-8 w-8 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">No data sources connected</h3>
          <p className="mx-auto mt-1 mb-5 max-w-sm text-xs text-gray-500">
            Connect a REST API or choose a Quick Preset (WooCommerce, WordPress, Shopify, Stripe, Zendesk) so assigned agents can retrieve live information.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => setAddingMode('presets')} className="gap-1.5">
              <Sparkles className="h-4 w-4" /> Inbuilt Presets
            </Button>
            <Button onClick={() => setAddingMode('custom')} variant="secondary" className="gap-1.5">
              <Code2 className="h-4 w-4" /> Custom REST API
            </Button>
          </div>
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center bg-gray-50/50 dark:bg-gray-900/30">
          <Search className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          <p className="text-xs text-gray-500">No data sources match your search query "{searchQuery}".</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredSources.map(source => (
            <article key={source.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-2 text-indigo-600">
                    <Server className="h-4 w-4" />
                  </span>
                  <h3 className="truncate text-xs font-semibold text-gray-900 dark:text-white">{source.name}</h3>
                </div>
                <span className={`rounded px-2 py-1 text-[10px] font-bold ${source.active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>
                  {source.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="my-3 rounded-lg bg-gray-50 dark:bg-gray-950 p-3 font-mono text-[11px]">
                <strong className="text-indigo-600 dark:text-indigo-400">{source.method}</strong>
                <p className="mt-1 break-all text-gray-500">{source.apiUrl}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <span className="text-[10px] text-gray-500">Auth: {source.authType.toUpperCase()}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSelected({ source, mode: 'view' })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                    <Eye className="h-3.5 w-3.5" />View
                  </button>
                  <button onClick={() => setSelected({ source, mode: 'edit' })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
                    <Edit3 className="h-3.5 w-3.5" />Edit
                  </button>
                  <button onClick={async () => { if (!confirm('Disable this data source tool?')) return; await apiClient.updateDataSourceTool(source.id, { status: 'disabled' }); await load() }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                    <Trash2 className="h-3.5 w-3.5" />Disable
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>

    {addingMode === 'presets' && (
      <PresetPickerModal
        chatbotId={chatbotId}
        agents={agents}
        onCancel={closeWizard}
        onComplete={async () => { await load(); closeWizard() }}
      />
    )}

    {addingMode === 'custom' && (
      <DataSourceWizard
        chatbotId={chatbotId}
        agents={agents}
        onCancel={closeWizard}
        onComplete={async () => { await load(); closeWizard() }}
      />
    )}

    {selected && <DataSourceDetailsModal connection={selected.source.connection} tool={selected.source.tool} initialMode={selected.mode} onClose={() => setSelected(null)} onSaved={load} />}
  </>
}

