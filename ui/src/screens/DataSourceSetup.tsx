import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, CheckCircle, ChevronLeft, Zap, Save } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { apiClient } from '../api/client'
import { BUILTIN_AGENTS } from '../config/agents'

const CANONICAL_FIELDS = [
  'order_id','status','placed_at','customer_name',
  'item','total','tracking','carrier','delivery_date','address','last_location',
]
const AUTH_TYPES   = ['none','bearer','api_key','basic']
const HTTP_METHODS = ['GET','POST','PUT','PATCH']

interface KV { key: string; value: string }
interface MappingRow { canonical: string; apiField: string }

const DYNAMIC_RE = /\{[^}]+\}/

function KVEditor({ label, rows, onChange, hint }: {
  label: string; rows: KV[]; onChange: (rows: KV[]) => void; hint?: string
}) {
  const add  = () => onChange([...rows, { key: '', value: '' }])
  const del  = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const edit = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; onChange(next)
  }
  const cls = 'flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400'
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <button onClick={add} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {hint && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2.5 py-1.5 mb-2">
          {hint}
        </p>
      )}
      {rows.length === 0 && (
        <p className="text-xs text-gray-400 italic px-1">No {label.toLowerCase()} added yet.</p>
      )}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const isDynamic = DYNAMIC_RE.test(row.value)
          return (
            <div key={i} className="space-y-0.5">
              <div className="flex gap-2 items-center">
                <input value={row.key}   onChange={e => edit(i,'key',  e.target.value)} placeholder="Key"   className={cls} />
                <input value={row.value} onChange={e => edit(i,'value',e.target.value)} placeholder="Value or {id}" className={cls} />
                <button onClick={() => del(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {isDynamic && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pl-1">
                  ⚡ Dynamic — user will provide the value for <code className="font-mono">{row.value}</code> at chat time
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DataSourceSetup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const defaultAgent = params.get('agent') || ''

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400'

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

  const toObj = (rows: KV[]) => Object.fromEntries(rows.filter(r => r.key).map(r => [r.key, r.value]))

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
      await apiClient.createDataSource({
        name,
        agent_type:      agentType,
        api_url:         apiUrl,
        method,
        auth_type:       authType,
        auth_value:      authValue,
        auth_header:     authHeader,
        request_headers: toObj(headers),
        request_params:  toObj(reqParams),
        request_body:    parsedBody,
        field_mapping:   fieldMapping,
      })
      navigate('/agents')
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const mappedCount = mapping.filter(r => r.apiField).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Back */}
        <button onClick={() => navigate('/agents')}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Agents
        </button>

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Connect Data Source</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter your API details — we'll fetch a sample and auto-map fields to the canonical schema.
          </p>
        </div>

        {/* Mock API hint */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4 text-sm">
          <p className="font-medium text-indigo-800 dark:text-indigo-300 mb-2">Test with the built-in mock APIs</p>
          <p className="text-indigo-700 dark:text-indigo-400 text-xs font-mono mb-2">Auth — Header: X-API-Key = test-key-123</p>
          <div className="space-y-1">
            <div>
              <p className="text-indigo-600 dark:text-indigo-400 text-xs font-mono">http://127.0.0.1:8000/api/v1/mock/acme/orders</p>
              <p className="text-indigo-500 dark:text-indigo-500 text-xs ml-1">order param key: <span className="font-mono">order_id</span> — test IDs: ORD-1001, ORD-1002</p>
            </div>
            <div>
              <p className="text-indigo-600 dark:text-indigo-400 text-xs font-mono">http://127.0.0.1:8000/api/v1/mock/vertex/orders</p>
              <p className="text-indigo-500 dark:text-indigo-500 text-xs ml-1">order param key: <span className="font-mono">id</span> — test IDs: 20050, 20051</p>
            </div>
            <div>
              <p className="text-indigo-600 dark:text-indigo-400 text-xs font-mono">http://127.0.0.1:8000/api/v1/mock/nova/orders</p>
              <p className="text-indigo-500 dark:text-indigo-500 text-xs ml-1">order param key: <span className="font-mono">ref</span> — test IDs: REF-88821, REF-88822</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT — Config */}
          <div className="space-y-5">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Basic Info</p>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Org1 Orders API" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Agent *</label>
                <select value={agentType} onChange={e => setAgentType(e.target.value)} className={inputCls}>
                  <option value="">Select agent…</option>
                  {BUILTIN_AGENTS.filter(a => a.slug !== 'triage').map(a => (
                    <option key={a.slug} value={a.type}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="w-28 flex-shrink-0">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Method *</label>
                  <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls}>
                    {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">API URL *</label>
                  <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://api.yourorg.com/orders" className={inputCls} />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Auth</p>

              <div className="flex gap-2 flex-wrap">
                {AUTH_TYPES.map(t => (
                  <button key={t} onClick={() => setAuthType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      authType === t
                        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-indigo-300'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>

              {authType !== 'none' && (
                <div className="space-y-3">
                  {authType === 'api_key' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Header Name</label>
                      <input value={authHeader} onChange={e => setAuthHeader(e.target.value)}
                        placeholder="X-API-Key" className={inputCls} />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {authType === 'bearer' ? 'Bearer Token' : authType === 'basic' ? 'Base64 Credentials' : 'API Key'}
                    </label>
                    <input type="password" value={authValue} onChange={e => setAuthValue(e.target.value)}
                      placeholder="••••••••" className={inputCls} />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Request Config</p>
              <KVEditor label="Additional Headers" rows={headers} onChange={setHeaders} />
              <KVEditor
                label="Query Parameters"
                rows={reqParams}
                onChange={setReqParams}
                hint='Edit the key to match your API (e.g. order_id, ref, orderId). The value {id} will be filled by the user at chat time.'
              />
              {['POST','PUT','PATCH'].includes(method) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Request Body (JSON)</label>
                  <textarea
                    value={reqBody}
                    onChange={e => setReqBody(e.target.value)}
                    rows={4}
                    placeholder={'{\n  "key": "value"\n}'}
                    className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 resize-none"
                  />
                </div>
              )}
            </div>

            {probeError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-xs text-red-600 dark:text-red-400">
                {probeError}
              </div>
            )}

            <Button onClick={probe} disabled={!apiUrl.trim() || probing} loading={probing} className="w-full">
              <Zap className="w-4 h-4" />
              {probing ? 'Fetching & Mapping…' : 'Fetch & Auto-Map Fields'}
            </Button>
          </div>

          {/* RIGHT — Mapping */}
          <div className="space-y-5">
            {sample && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Sample Record
                  <span className="ml-2 text-xs font-normal text-gray-400">from your API</span>
                </p>
                <pre className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48">
                  {JSON.stringify(sample, null, 2)}
                </pre>
              </div>
            )}

            {mapping.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Field Mapping</p>
                  <span className="text-xs text-gray-400">{mappedCount}/{mapping.length} mapped</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">LLM auto-mapped these fields. Edit any incorrect ones.</p>

                <div className="space-y-2">
                  {mapping.map((row, i) => (
                    <div key={row.canonical} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 w-28 flex-shrink-0">{row.canonical}</span>
                      <span className="text-gray-300 dark:text-gray-600 text-xs">→</span>
                      <select
                        value={row.apiField}
                        onChange={e => {
                          const next = [...mapping]; next[i] = { ...row, apiField: e.target.value }; setMapping(next)
                        }}
                        className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
                      >
                        <option value="">— not mapped —</option>
                        {rawFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      {row.apiField
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}

            {probed && (
              <div className="space-y-2">
                {saveError && (
                  <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{saveError}</p>
                )}
                <Button
                  onClick={save}
                  disabled={!name.trim() || !agentType || saving}
                  loading={saving}
                  className="w-full"
                >
                  <Save className="w-4 h-4" /> Save Data Source
                </Button>
              </div>
            )}

            {!probed && (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
                <Zap className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Fill in the API details and click <strong>Fetch & Auto-Map</strong> to see the field mapping here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
