import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, CheckCircle, ChevronLeft, Zap, Save, Server, Plug, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { apiClient } from '../api/client'
import { BUILTIN_AGENTS } from '../config/agents'
import { useAppStore } from '../store/useAppStore'


const CANONICAL_FIELDS = [
  'order_id','status','placed_at','customer_name',
  'item','total','tracking','carrier','delivery_date','address','last_location',
]
const AUTH_TYPES   = ['none','bearer','api_key','basic']
const HTTP_METHODS = ['GET','POST','PUT','PATCH']

interface KV { key: string; value: string }
interface MappingRow { canonical: string; apiField: string }

interface DataSource {
  id: string
  name: string
  agent_type: string
  api_url: string
  auth_type: string
  method: string
  active: boolean
  created_at: string
  connection_id?: string
}

interface OrgAgent {
  id: string
  slug: string
  name: string
  active: boolean
  is_builtin: boolean
}

const DYNAMIC_RE = /\{[^}]+\}/

function KVEditor({ label, rows, onChange, hint }: {
  label: string; rows: KV[]; onChange: (rows: KV[]) => void; hint?: string
}) {
  const add  = () => onChange([...rows, { key: '', value: '' }])
  const del  = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const edit = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; onChange(next)
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{label}</label>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Field
        </button>
      </div>
      {hint && (
        <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/15 rounded-lg px-3 py-2 leading-relaxed">
          {hint}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3 border border-dashed border-gray-200 dark:border-gray-800">
          No {label.toLowerCase()} added yet.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            const isDynamic = DYNAMIC_RE.test(row.value)
            return (
              <div key={i} className="space-y-1.5 bg-gray-50/30 dark:bg-gray-900/10 border border-gray-150 dark:border-gray-850 rounded-xl p-2.5">
                <div className="flex gap-2 items-center">
                  <Input value={row.key} onChange={e => edit(i,'key', e.target.value)} placeholder="Key (e.g. order_id)" containerClassName="flex-1" />
                  <Input value={row.value} onChange={e => edit(i,'value', e.target.value)} placeholder="Value or {id}" containerClassName="flex-1" />
                  <button type="button" onClick={() => del(i)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {isDynamic && (
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 pl-1 font-medium flex items-center gap-1">
                    <span>⚡ Dynamic — user will supply target ID at chat time</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function DataSourceSetup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const defaultAgent = params.get('agent') || ''
  const currentChatbotId = useAppStore(s => s.currentChatbotId)

  // Form state
  const [name,        setName]       = useState('')
  const [agentType,   setAgentType]  = useState(defaultAgent)
  const [apiUrl,      setApiUrl]     = useState('')
  const [method,      setMethod]     = useState('GET')
  const [authType,    setAuthType]   = useState('none')
  const [authValue,   setAuthValue]  = useState('')
  const [authHeader,  setAuthHeader] = useState('Authorization')
  const [headers,     setHeaders]    = useState<KV[]>([])
  const [reqParams,   setReqParams]  = useState<KV[]>([{ key: 'order_id', value: '{id}' }])
  const [reqBody,     setReqBody]    = useState('')   // raw JSON string for POST/PUT
  const [mapping,    setMapping]    = useState<MappingRow[]>([])
  const [sample,     setSample]     = useState<Record<string,any> | null>(null)
  const [rawFields,  setRawFields]  = useState<string[]>([])

  const [probing,    setProbing]    = useState(false)
  const [probeError, setProbeError] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [probed,     setProbed]     = useState(false)

  // Data Sources listing state
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [availableAgents, setAvailableAgents] = useState<OrgAgent[]>([])
  const [loadingSources, setLoadingSources] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoadingSources(true)
      try {
        const [connections, tools, agents] = await Promise.all([
          apiClient.listDataSourceConnections(),
          apiClient.listDataSourceTools(),
          apiClient.listOrgAgents(currentChatbotId),
        ])
        setAvailableAgents(agents)
        const byConnection = new Map(connections.map((item: any) => [item.id, item]))
        setDataSources(tools.map((tool: any) => {
          const connection: any = byConnection.get(tool.connection_id) || {}
          return {
            id: tool.id,
            connection_id: tool.connection_id,
            name: tool.display_name || tool.name,
            agent_type: 'Assigned agent',
            api_url: `${connection.base_url || ''}${tool.path || ''}`,
            auth_type: connection.auth_type || 'none',
            method: tool.method,
            active: tool.status === 'active',
            created_at: tool.created_at,
          }
        }))
        if (defaultAgent && !agentType) {
          const match = agents.find((agent: OrgAgent) => agent.slug === defaultAgent && agent.active)
          if (match) setAgentType(match.id)
        }
        if (defaultAgent) {
          setIsAdding(true)
        }
      } catch (e) {
        console.error('Failed to list data sources', e)
      } finally {
        setLoadingSources(false)
      }
    }
    load()
  }, [defaultAgent, currentChatbotId])

  const toObj = (rows: KV[]) => Object.fromEntries(rows.filter(r => r.key).map(r => [r.key, r.value]))

  const prefillMock = (type: 'acme' | 'vertex' | 'nova') => {
    if (type === 'acme') {
      setName('ACME Orders API')
      setApiUrl('http://127.0.0.1:8000/api/v1/mock/acme/orders')
      setMethod('GET')
      setAuthType('api_key')
      setAuthHeader('X-API-Key')
      setAuthValue('test-key-123')
      setReqParams([{ key: 'order_id', value: '{id}' }])
    } else if (type === 'vertex') {
      setName('Vertex Orders API')
      setApiUrl('http://127.0.0.1:8000/api/v1/mock/vertex/orders')
      setMethod('GET')
      setAuthType('api_key')
      setAuthHeader('X-API-Key')
      setAuthValue('test-key-123')
      setReqParams([{ key: 'id', value: '{id}' }])
    } else if (type === 'nova') {
      setName('Nova Orders API')
      setApiUrl('http://127.0.0.1:8000/api/v1/mock/nova/orders')
      setMethod('GET')
      setAuthType('api_key')
      setAuthHeader('X-API-Key')
      setAuthValue('test-key-123')
      setReqParams([{ key: 'ref', value: '{id}' }])
    }
    setProbed(false)
    setSample(null)
    setMapping([])
  }

  const probe = async () => {
    if (!apiUrl.trim()) return
    setProbing(true); setProbeError(''); setProbed(false)
    try {
      let parsedBody: object | undefined
      if (reqBody.trim()) {
        try { parsedBody = JSON.parse(reqBody) }
        catch { throw new Error('Request body is not valid JSON.') }
      }
      const res = await apiClient.probeDataSource({
        api_url:         apiUrl,
        method,
        auth_type:       authType,
        auth_value:      authValue,
        auth_header:     authHeader,
        request_headers: toObj(headers),
        request_params:  toObj(reqParams),
        request_body:    parsedBody,
      })
      setSample(res.sample)
      setRawFields(res.raw_fields)
      setMapping(CANONICAL_FIELDS.map(f => ({ canonical: f, apiField: res.mapping[f] || '' })))
      setProbed(true)
    } catch (e: any) {
      setProbeError(e?.response?.data?.detail || e.message || 'Failed to reach the API.')
    } finally {
      setProbing(false)
    }
  }

  const save = async () => {
    if (!name.trim() || !agentType || !apiUrl.trim() || !probed) return
    setSaving(true); setSaveError('')
    try {
      const fieldMapping: Record<string, string | null> = {}
      mapping.forEach(r => { fieldMapping[r.canonical] = r.apiField.trim() || null })
      let parsedBody: object | undefined
      if (reqBody.trim()) {
        try { parsedBody = JSON.parse(reqBody) }
        catch { throw new Error('Request body is not valid JSON.') }
      }
      if (!currentChatbotId) throw new Error('Select a chatbot before assigning a data source.')
      const selectedAgent = availableAgents.find(agent => agent.id === agentType && agent.active)
      if (!selectedAgent) throw new Error('Select an active target agent.')
      const endpoint = new URL(apiUrl)
      const safeDefaultHeaders = Object.fromEntries(
        headers.filter(row => ['accept','content-type','accept-language'].includes(row.key.toLowerCase()))
          .map(row => [row.key, row.value]),
      )
      const dynamicHeaders = Object.fromEntries(
        headers.filter(row => !['accept','content-type','accept-language'].includes(row.key.toLowerCase()))
          .map(row => [row.key, row.value]),
      )
      const connection = await apiClient.createDataSourceConnection({
        name,
        base_url: endpoint.origin,
        auth_type: authType,
        auth_header: authHeader,
        secret: authValue || null,
        default_headers: safeDefaultHeaders,
      })
      const requestTemplate = {
        query: toObj(reqParams),
        headers: dynamicHeaders,
        body: parsedBody || {},
      }
      const templateText = JSON.stringify({ path: endpoint.pathname, ...requestTemplate })
      const placeholders = Array.from(new Set(Array.from(templateText.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g), match => match[1])))
      const toolStem = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'lookup'
      const toolName = `${toolStem.slice(0, 48)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
      const tool = await apiClient.createDataSourceTool({
        connection_id: connection.id,
        name: toolName,
        display_name: name,
        description: `Retrieve live data from ${name}`,
        method,
        path: endpoint.pathname || '/',
        risk_classification: 'read',
        input_schema: {
          type: 'object',
          properties: Object.fromEntries(placeholders.map(key => [key, { type: 'string' }])),
          required: placeholders,
          additionalProperties: false,
        },
        request_template: requestTemplate,
        output_mapping: fieldMapping,
        record_path: '',
        max_records: 25,
      })
      await apiClient.replaceDataSourceAssignments(tool.id, {
        chatbot_id: currentChatbotId,
        assignments: [{
          agent_kind: selectedAgent.is_builtin ? 'builtin' : 'custom',
          agent_id: selectedAgent.id,
          enabled: true,
        }],
      })
      const testArguments = Object.fromEntries(placeholders.map(key => [key, `{${key}}`]))
      const test = await apiClient.testDataSourceTool(tool.id, {
        chatbot_id: currentChatbotId,
        arguments: testArguments,
      })
      if (test.outcome === 'success') {
        await apiClient.updateDataSourceTool(tool.id, { status: 'active' })
      }
      setDataSources(current => [{
        id: tool.id,
        connection_id: connection.id,
        name,
        agent_type: selectedAgent.id,
        api_url: apiUrl,
        auth_type: authType,
        method,
        active: test.outcome === 'success',
        created_at: new Date().toISOString(),
      }, ...current])
      const isStandalone = window.location.pathname.startsWith('/app/agents/datasource')
      if (isStandalone) {
        navigate('/app/agents')
      } else {
        setName('')
        setApiUrl('')
        setMethod('GET')
        setAuthType('none')
        setAuthValue('')
        setAuthHeader('Authorization')
        setHeaders([])
        setReqParams([{ key: 'order_id', value: '{id}' }])
        setReqBody('')
        setMapping([])
        setSample(null)
        setRawFields([])
        setProbed(false)
      }
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || e.message || 'Failed to save data source.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDs = async (id: string) => {
    if (!confirm('Disable this data source tool? Existing test history will be preserved.')) return
    try {
      await apiClient.updateDataSourceTool(id, { status: 'disabled' })
      setDataSources(current => current.map(item => item.id === id ? { ...item, active: false } : item))
    } catch (e) {
      alert('Failed to disable data source.')
    }
  }

  const agentNameOf = (type: string) => {
    const found = availableAgents.find(a => a.id === type) || BUILTIN_AGENTS.find(a => a.type === type)
    return found ? found.name : type
  }

  const mappedCount = mapping.filter(m => m.apiField).length

  if (loadingSources) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-xs text-gray-500 font-medium">Loading data sources…</p>
      </div>
    )
  }

  if (!isAdding) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-250/60 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Active Integrations</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{dataSources.length} external connection{dataSources.length !== 1 ? 's' : ''} configured</p>
          </div>
          <Button onClick={() => setIsAdding(true)} className="flex items-center gap-1.5 shadow-sm text-xs py-2 px-3">
            <Plus className="w-4 h-4" /> Add Data Source
          </Button>
        </div>

        {dataSources.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-250/85 dark:border-gray-800 p-12 text-center shadow-sm">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Plug className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Data Sources Connected</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-5 leading-relaxed">
              Connect external REST APIs to enable your agent fleet to retrieve real-time customer and order information dynamically.
            </p>
            <Button onClick={() => setIsAdding(true)} className="inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Data Source
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dataSources.map(ds => (
              <div key={ds.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-850 p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex-shrink-0">
                        <Server className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-gray-950 dark:text-white truncate">{ds.name}</h4>
                        <p className="text-[10px] text-gray-400 font-medium">Agent: <span className="text-indigo-600 dark:text-indigo-400">{agentNameOf(ds.agent_type)}</span></p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      ds.active ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${ds.active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {ds.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  <div className="space-y-1 bg-gray-50 dark:bg-gray-950/30 border border-gray-100 dark:border-gray-850 p-2.5 rounded-lg font-mono text-[11px] text-gray-600 dark:text-gray-400 break-all leading-normal">
                    <div className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
                      <span className="bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded text-[9px] font-extrabold tracking-wider">{ds.method || 'GET'}</span>
                    </div>
                    <p className="mt-1 text-gray-500 dark:text-gray-405 select-all">{ds.api_url}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 mt-3 pt-3">
                  <span className="text-[10px] text-gray-400 font-medium">
                    Auth: <span className="font-semibold text-gray-500 dark:text-gray-300 font-mono">{(ds.auth_type || 'none').toUpperCase()}</span>
                  </span>
                  <button onClick={() => handleDeleteDs(ds.id)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> Disable
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const isStandalone = window.location.pathname.startsWith('/app/agents/datasource')

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">

      <button onClick={() => {
        if (isStandalone) {
          navigate('/app/agents')
        } else {
          setIsAdding(false)
        }
      }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
        <ChevronLeft className="w-4 h-4" /> {isStandalone ? 'Back to Agents' : 'Back to Integrations'}
      </button>

      <div className="space-y-5">

        {/* Unified Connection Settings */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-250/80 dark:border-gray-800 p-6 shadow-sm space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Connection Details</h3>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded uppercase font-mono">REST API</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Source Name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Org1 Orders API"
            />
            <Select
              label="Target Fleet Agent"
              required
              value={agentType}
              onChange={e => setAgentType(e.target.value)}
            >
              <option value="">Select agent…</option>
              {availableAgents.filter(a => a.active && a.slug !== 'triage').map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.is_builtin ? '' : ' (Custom)'}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-[110px_1fr] gap-3 mt-4">
            <Select
              label="HTTP Method"
              required
              value={method}
              onChange={e => setMethod(e.target.value)}
            >
              {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Input
              label="API Endpoint URL"
              required
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="https://api.yourorg.com/orders"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Auth Protocol</label>
              <div className="flex gap-1.5">
                {AUTH_TYPES.map(t => (
                  <button key={t} type="button" onClick={() => setAuthType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      authType === t
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {authType !== 'none' ? (
              <div className="flex gap-3 mt-4">
                {authType === 'api_key' ? (
                  <div className="w-1/3">
                    <Input
                      label="Header Name"
                      value={authHeader}
                      onChange={e => setAuthHeader(e.target.value)}
                      placeholder="X-API-Key"
                    />
                  </div>
                ) : null}
                <div className="flex-1">
                  <Input
                    label={authType === 'bearer' ? 'Bearer Access Token' : authType === 'basic' ? 'Basic Credentials (base64)' : 'API Key Value'}
                    type="password"
                    value={authValue}
                    onChange={e => setAuthValue(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center text-xs text-gray-400 italic pt-6 pl-2">
                No authentication required.
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
            <KVEditor label="Custom Request Headers" rows={headers} onChange={setHeaders} />
            <KVEditor
              label="Request Query Parameters"
              rows={reqParams}
              onChange={setReqParams}
              hint="Edit the Query Key to match what your API expects (e.g. order_id, id, ref). Use {id} as the value to dynamically inject search targets."
            />

            {['POST','PUT','PATCH'].includes(method) && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Request Body Template (JSON)</label>
                <textarea
                  value={reqBody}
                  onChange={e => setReqBody(e.target.value)}
                  rows={4}
                  placeholder={'{\n  "key": "value"\n}'}
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 resize-none animate-fadeIn"
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 3 — Actions & Output */}
        <div className="space-y-4">
          {probeError && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-xs font-medium text-red-600 dark:text-red-400">
              {probeError}
            </div>
          )}

          <Button onClick={probe} disabled={!apiUrl.trim() || probing} loading={probing} className="w-full py-2.5">
            <Zap className="w-4 h-4" />
            {probing ? 'Probing service & resolving schema…' : 'Fetch API Details & Match Schema'}
          </Button>
        </div>

        {/* Mapping & Testing Results */}
        {probed && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2 animate-fadeIn">
            
            {/* Left Column — JSON Response */}
            {sample && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-250/80 dark:border-gray-800 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Sample Response Record</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Payload returned from the target service</p>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded uppercase">JSON</span>
                </div>
                <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-950 p-4 rounded-xl overflow-x-auto whitespace-pre font-mono max-h-72 border border-gray-100 dark:border-gray-850 leading-relaxed scrollbar-thin">
                  {JSON.stringify(sample, null, 2)}
                </pre>
              </div>
            )}

            {/* Right Column — Schema Field Matching */}
            {mapping.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-250/80 dark:border-gray-800 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Schema Field Matching</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">{mappedCount}/{mapping.length} attributes successfully mapped</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Verify and adjust the mapped CRM values to match the API response.
                </p>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {mapping.map((row, i) => (
                    <div key={row.canonical} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-gray-850 bg-gray-50/20 dark:bg-gray-950/20">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 font-mono block truncate">{row.canonical}</span>
                      </div>
                      <span className="text-gray-300 dark:text-gray-700 text-xs">→</span>
                      <select
                        value={row.apiField}
                        onChange={e => {
                          const next = [...mapping]; next[i] = { ...row, apiField: e.target.value }; setMapping(next)
                        }}
                        className="w-40 px-2 py-1.5 text-xs bg-white dark:bg-gray-805 border border-gray-200 dark:border-gray-750 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 dark:text-gray-350"
                      >
                        <option value="">— Choose Attribute —</option>
                        {rawFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      {row.apiField ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save Controls */}
            <div className="lg:col-span-2 space-y-2 pt-2">
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{saveError}</p>
              )}
              <Button
                onClick={save}
                disabled={!name.trim() || !agentType || saving}
                loading={saving}
                className="w-full py-2.5 shadow-sm"
              >
                <Save className="w-4 h-4" /> Save Data Source Configuration
              </Button>
            </div>
          </div>
        )}

        {!probed && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-250/80 dark:border-gray-800 p-8 text-center shadow-sm">
            <Zap className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2 animate-pulse" />
            <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
              Configure your service details above and click the <strong>Fetch API Details</strong> button to run the connection test and match schemas.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
