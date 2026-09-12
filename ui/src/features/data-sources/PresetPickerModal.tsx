import React, { useEffect, useState } from 'react'
import { AlertCircle, Check, ChevronRight, Loader2, RefreshCw, Search, Server, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { apiClient } from '../../api/client'
import { dataSourceOnboardingApi } from './api'
import type { FleetAgent } from './types'

interface PresetPickerModalProps {
  chatbotId: string | null
  agents: FleetAgent[]
  onCancel: () => void
  onComplete: () => void
}

export function PresetPickerModal({ chatbotId, agents, onCancel, onComplete }: PresetPickerModalProps) {
  const [step, setStep] = useState<'select' | 'configure' | 'assign'>('select')
  const [presets, setPresets] = useState<any[]>([])
  const [selectedPreset, setSelectedPreset] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [agentId, setAgentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingPresets, setLoadingPresets] = useState(true)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<any | null>(null)
  const [savedToolId, setSavedToolId] = useState('')
  const [savedStatus, setSavedStatus] = useState<'draft' | 'active' | null>(null)

  const selectableAgents = agents.filter(agent => agent.active && agent.slug !== 'triage')

  useEffect(() => {
    setLoadingPresets(true)
    apiClient.listDataSourcePresets()
      .then(res => {
        if (res.presets) setPresets(res.presets)
      })
      .catch(() => setError('Failed to load preset list from server.'))
      .finally(() => setLoadingPresets(false))
  }, [])

  const handleSelectPreset = (preset: any) => {
    setSelectedPreset(preset)
    setCredentials({})
    setError('')
    setTestResult(null)
    setStep('configure')
  }

  const handleTestConnection = async () => {
    if (!selectedPreset) return
    if (!chatbotId) {
      setError('Please select an active chatbot before testing connection.')
      return
    }

    const missingReq = selectedPreset.required_credentials?.filter(
      (c: any) => c.required && !credentials[c.name]?.trim()
    )
    if (missingReq && missingReq.length > 0) {
      setError(`Please provide required field: ${missingReq[0].label}`)
      return
    }

    setError('')
    setBusy(true)

    const siteUrl = credentials.site_url || credentials.shop_url || (credentials.subdomain ? `https://${credentials.subdomain}.zendesk.com` : '')
    const baseUrl = (selectedPreset.base_url_template || '{site_url}')
      .replace('{site_url}', siteUrl || 'https://api.example.com')
      .replace('{shop_url}', credentials.shop_url || 'shop.myshopify.com')
      .replace('{subdomain}', credentials.subdomain || 'mybrand')

    let secretVal = credentials.access_token || credentials.api_token || credentials.api_key || ''
    if (selectedPreset.auth_type === 'basic' && credentials.consumer_key && credentials.consumer_secret) {
      secretVal = `${credentials.consumer_key}:${credentials.consumer_secret}`
    } else if (selectedPreset.auth_type === 'basic' && credentials.email && credentials.api_token) {
      secretVal = `${credentials.email}/token:${credentials.api_token}`
    }

    const defaultTool = selectedPreset.default_tool || selectedPreset.tools?.[0] || {}

    const draft = {
      source_type: 'preset',
      warnings: [],
      connection: {
        name: `${selectedPreset.name} Connection`,
        base_url: baseUrl.replace(/\/$/, ''),
        auth_type: selectedPreset.auth_type || 'none',
        auth_header: selectedPreset.auth_header || 'Authorization',
        credential_required: Boolean(secretVal),
        default_headers: {},
      },
      tool: {
        name: defaultTool.name || 'lookup_data',
        display_name: defaultTool.display_name || defaultTool.name || 'Lookup Data',
        description: defaultTool.description || '',
        method: defaultTool.method || 'GET',
        path: defaultTool.path || '/',
        input_schema: defaultTool.input_schema || { type: 'object', properties: {}, required: [], additionalProperties: false },
        request_template: defaultTool.request_template || { query: {}, headers: {}, body: {} },
        record_path: defaultTool.record_path || '',
        output_mapping: defaultTool.output_mapping || {},
      },
    }

    try {
      const result = await dataSourceOnboardingApi.test(draft, chatbotId, secretVal, {})
      setTestResult(result)
      if (result.failure) {
        setError(result.failure.message || 'Connection test failed. Verify credentials.')
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Connection test failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDataSource = async () => {
    if (!selectedPreset) return
    setError('')
    setBusy(true)

    const siteUrl = credentials.site_url || credentials.shop_url || (credentials.subdomain ? `https://${credentials.subdomain}.zendesk.com` : '')
    const baseUrl = (selectedPreset.base_url_template || '{site_url}')
      .replace('{site_url}', siteUrl || 'https://api.example.com')
      .replace('{shop_url}', credentials.shop_url || 'shop.myshopify.com')
      .replace('{subdomain}', credentials.subdomain || 'mybrand')

    let secretVal = credentials.access_token || credentials.api_token || credentials.api_key || ''
    if (selectedPreset.auth_type === 'basic' && credentials.consumer_key && credentials.consumer_secret) {
      secretVal = `${credentials.consumer_key}:${credentials.consumer_secret}`
    } else if (selectedPreset.auth_type === 'basic' && credentials.email && credentials.api_token) {
      secretVal = `${credentials.email}/token:${credentials.api_token}`
    }

    const defaultTool = selectedPreset.default_tool || selectedPreset.tools?.[0] || {}

    try {
      const conn = await apiClient.createDataSourceConnection({
        name: `${selectedPreset.name} Connection`,
        base_url: baseUrl.replace(/\/$/, ''),
        auth_type: selectedPreset.auth_type || 'none',
        auth_header: selectedPreset.auth_header || 'Authorization',
        secret: secretVal || null,
        default_headers: {},
      })

      const tool = await apiClient.createDataSourceTool({
        connection_id: conn.id,
        name: defaultTool.name || 'lookup_data',
        display_name: defaultTool.display_name || defaultTool.name || 'Lookup Data',
        description: defaultTool.description || '',
        method: defaultTool.method || 'GET',
        path: defaultTool.path || '/',
        input_schema: defaultTool.input_schema || { type: 'object', properties: {}, required: [], additionalProperties: false },
        request_template: defaultTool.request_template || { query: {}, headers: {}, body: {} },
        record_path: defaultTool.record_path || '',
        output_mapping: defaultTool.output_mapping || {},
        risk_classification: 'read',
        max_records: 25,
      })

      let status: 'draft' | 'active' = 'draft'
      if (chatbotId) {
        const testRes = await apiClient.testDataSourceTool(tool.id, { chatbot_id: chatbotId, arguments: {} })
        if (testRes.outcome === 'success') {
          await apiClient.updateDataSourceConnection(conn.id, { status: 'active' })
          await apiClient.updateDataSourceTool(tool.id, { status: 'active' })
          status = 'active'
        }
      }

      setSavedToolId(tool.id)
      setSavedStatus(status)
      setStep('assign')
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to save data source preset.')
    } finally {
      setBusy(false)
    }
  }

  const handleAssignAgent = async () => {
    if (!savedToolId || !chatbotId || !agentId) return
    const agent = selectableAgents.find(a => a.id === agentId)
    if (!agent) return
    setError('')
    setBusy(true)
    try {
      await apiClient.replaceDataSourceAssignments(savedToolId, {
        chatbot_id: chatbotId,
        assignments: [{ agent_kind: agent.is_builtin ? 'builtin' : 'custom', agent_id: agent.id, enabled: true }],
      })
      onComplete()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to assign agent.')
    } finally {
      setBusy(false)
    }
  }

  const filteredPresets = presets.filter(p => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-xs"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
                {step === 'select' ? 'Inbuilt Data Source Presets' : `Connect ${selectedPreset?.name}`}
              </h2>
              <p className="text-xs text-gray-500">
                {step === 'select'
                  ? 'Select a platform to connect WooCommerce, WordPress, Shopify, Stripe, or Zendesk'
                  : 'Enter site URL and credentials to test and save'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* SCREEN 1: Select Preset */}
          {step === 'select' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search platform presets (WooCommerce, WordPress, Shopify)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {loadingPresets ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  <p className="text-xs text-gray-400">Loading preset catalog...</p>
                </div>
              ) : filteredPresets.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-500">
                  No preset matches "{searchQuery}".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPresets.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className="text-left p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {p.name}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          {p.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                        <span>Configure Preset</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SCREEN 2: Configure Credentials */}
          {step === 'configure' && selectedPreset && (
            <div className="space-y-5">
              <div className="flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    Platform: {selectedPreset.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                    API {selectedPreset.api_version}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Change Preset
                </button>
              </div>

              <div className="space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Required Connection Credentials
                </h4>
                {selectedPreset.required_credentials?.map((cred: any) => (
                  <div key={cred.name} className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200 pl-0.5">
                      {cred.label} {cred.required && <span className="text-rose-500">*</span>}
                    </label>
                    <Input
                      type={cred.type === 'password' ? 'password' : 'text'}
                      placeholder={cred.placeholder}
                      required={cred.required}
                      value={credentials[cred.name] || ''}
                      onChange={e => setCredentials(prev => ({ ...prev, [cred.name]: e.target.value }))}
                      className="text-xs bg-white dark:bg-gray-950"
                    />
                    {cred.help && <p className="text-[11px] text-gray-400 pl-0.5">{cred.help}</p>}
                  </div>
                ))}
              </div>

              {testResult && (
                <div className={`p-4 rounded-2xl border text-xs ${
                  testResult.failure
                    ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                }`}>
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {testResult.failure ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    <span>{testResult.failure ? 'Connection Test Failed' : 'Connection Verified Successfully!'}</span>
                  </div>
                  <p className="text-[11px] opacity-90">
                    {testResult.failure ? testResult.failure.message : 'Upstream platform API responded cleanly. Ready to save.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SCREEN 3: Assign Agent */}
          {step === 'assign' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-4 rounded-2xl">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-sm font-bold">
                  <Check className="w-5 h-5" /> Data source saved successfully!
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Status: <strong>{savedStatus === 'active' ? 'Active' : 'Draft'}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Assign to Fleet Agent (Optional)
                </h4>
                <Select label="Fleet Agent" value={agentId} onChange={e => setAgentId(e.target.value)}>
                  <option value="">Select agent to assign...</option>
                  {selectableAgents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}{a.is_builtin ? '' : ' (Custom)'}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={step === 'configure' ? () => setStep('select') : onCancel}
            disabled={busy}
          >
            {step === 'configure' ? 'Back to Presets' : 'Cancel'}
          </Button>

          <div className="flex gap-2">
            {step === 'configure' && (
              <>
                <Button size="sm" variant="secondary" onClick={handleTestConnection} loading={busy}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Test Connection
                </Button>
                <Button size="sm" onClick={handleSaveDataSource} loading={busy} className="gap-1">
                  Save Data Source <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </>
            )}

            {step === 'assign' && (
              <>
                <Button size="sm" variant="secondary" onClick={onComplete} disabled={busy}>
                  Skip for Now
                </Button>
                <Button size="sm" onClick={handleAssignAgent} loading={busy} disabled={!agentId}>
                  Assign Agent
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
