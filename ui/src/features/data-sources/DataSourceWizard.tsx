import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Copy, FileCode2, Link2, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { apiClient } from '../../api/client'
import { dataSourceOnboardingApi } from './api'
import type { DataSourceDraft, FleetAgent } from './types'
import { InfoHint, SectionTitle } from './InfoHint'

const STEPS = ['Import', 'Connection', 'Review & save', 'Assign agent']
const CURL_EXAMPLES = {
  get: `curl --request GET 'https://api.example.com/v1/orders/{order_id}?include=tracking' \\
  --header 'Accept: application/json' \\
  --header 'X-API-Key: YOUR_API_KEY'`,
  post: `curl --request POST 'https://api.example.com/v1/customers/search' \\
  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{"customer_id":"{customer_id}","include_orders":true}'`,
}

const blankDraft = (): DataSourceDraft => ({
  source_type: 'manual', warnings: [],
  connection: { name: '', base_url: '', auth_type: 'none', auth_header: 'Authorization', credential_required: false, default_headers: {} },
  tool: { name: 'lookup_data', display_name: '', description: '', method: 'GET', path: '/', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, request_template: { query: {}, headers: {}, body: {} }, record_path: '', output_mapping: {} },
})

function messageOf(error: any) {
  return error?.response?.data?.detail || error?.message || 'Something went wrong. Your entries were preserved.'
}

export function DataSourceWizard({ chatbotId, agents, onCancel, onComplete }: {
  chatbotId: string | null
  agents: FleetAgent[]
  onCancel: () => void
  onComplete: () => void
}) {
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'ai' | 'url' | 'advanced'>('ai')
  const [advancedMode, setAdvancedMode] = useState<'openapi' | 'curl' | 'manual'>('openapi')
  const [curlExample, setCurlExample] = useState<'get' | 'post'>('get')
  const [copiedExample, setCopiedExample] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiMissing, setAiMissing] = useState<string[]>([])
  const [endpointUrl, setEndpointUrl] = useState('')
  const [definition, setDefinition] = useState('')
  const [drafts, setDrafts] = useState<DataSourceDraft[]>([])
  const [draftIndex, setDraftIndex] = useState(0)
  const [draft, setDraft] = useState<DataSourceDraft>(blankDraft)
  const [credential, setCredential] = useState('')
  const [agentId, setAgentId] = useState('')
  const [sampleText, setSampleText] = useState('')
  const [aiApplied, setAiApplied] = useState(false)
  const [pendingAnalysis, setPendingAnalysis] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connectionArgs, setConnectionArgs] = useState<Record<string, string>>({})
  const [connectionTest, setConnectionTest] = useState<any>(null)
  const [sampleSource, setSampleSource] = useState<'validated' | 'manual' | null>(null)
  const [observedFields, setObservedFields] = useState<string[]>([])
  const [savedToolId, setSavedToolId] = useState('')
  const [savedStatus, setSavedStatus] = useState<'draft' | 'active' | null>(null)

  const selectableAgents = agents.filter(agent => agent.active && agent.slug !== 'triage')
  const inputNames = Object.keys((draft.tool.input_schema?.properties || {}) as Record<string, unknown>)
  const queryInputNames = new Set(Object.values(draft.tool.request_template.query || {}).flatMap(value => {
    const match = String(value).match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}$/)
    return match ? [match[1]] : []
  }))
  const remainingInputNames = inputNames.filter(name => !queryInputNames.has(name))
  const requestHeaders: Record<string, string> = Object.fromEntries(Object.entries({
    ...(draft.connection.default_headers || {}),
    ...(draft.tool.request_template.headers || {}),
  }).map(([key, value]) => [key, String(value)]))
  const connectionFingerprint = useMemo(() => JSON.stringify({
    connection: draft.connection,
    request: {
      method: draft.tool.method, path: draft.tool.path,
      input_schema: draft.tool.input_schema, request_template: draft.tool.request_template,
    },
    credential, connectionArgs,
  }), [draft.connection, draft.tool.method, draft.tool.path, draft.tool.input_schema, draft.tool.request_template, credential, connectionArgs])
  useEffect(() => setConnectionTest(null), [connectionFingerprint])
  useEffect(() => {
    if (step !== 1) return
    setConnectionArgs(current => Object.fromEntries(inputNames.map(name => [name, current[name] || ''])))
  }, [step, JSON.stringify(inputNames)])
  const hasChanges = !savedToolId && (step > 0 || Boolean(aiPrompt.trim() || endpointUrl.trim() || definition.trim() || credential || agentId || sampleText.trim()))
  const requestClose = () => {
    if (savedToolId) { onComplete(); return }
    if (!hasChanges || window.confirm('Discard this data source draft? Your entries will be lost.')) onCancel()
  }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) requestClose() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previousOverflow }
  }, [hasChanges, busy, savedToolId])

  const updateConnection = (field: string, value: unknown) => setDraft(current => ({
    ...current, connection: { ...current.connection, [field]: value },
  }))
  const updateTool = (field: string, value: unknown) => setDraft(current => ({
    ...current, tool: { ...current.tool, [field]: value },
  }))
  const updateQuery = (key: string, value: string) => setDraft(current => ({
    ...current,
    tool: {
      ...current.tool, request_template: {
        ...current.tool.request_template,
        query: { ...(current.tool.request_template.query || {}), [key]: value },
      }
    },
  }))
  const setRequestHeaders = (headers: Record<string, string>) => setDraft(current => ({
    ...current,
    connection: { ...current.connection, default_headers: {} },
    tool: { ...current.tool, request_template: { ...current.tool.request_template, headers } },
  }))
  const updateRequestHeader = (oldKey: string, nextKey: string, value: string) => {
    const entries = Object.entries(requestHeaders).filter(([key]) => key !== oldKey)
    setRequestHeaders(Object.fromEntries([...entries, [nextKey, value]]))
  }
  const addRequestHeader = () => {
    let index = Object.keys(requestHeaders).length + 1
    let key = `X-Custom-Header-${index}`
    while (key in requestHeaders) { index += 1; key = `X-Custom-Header-${index}` }
    setRequestHeaders({ ...requestHeaders, [key]: '' })
  }
  const removeRequestHeader = (target: string) => setRequestHeaders(Object.fromEntries(Object.entries(requestHeaders).filter(([key]) => key !== target)))
  const updateOutputMapping = (oldTarget: string, nextTarget: string, source: string) => setDraft(current => ({
    ...current,
    tool: { ...current.tool, output_mapping: Object.fromEntries([
      ...Object.entries(current.tool.output_mapping || {}).filter(([target]) => target !== oldTarget),
      [nextTarget, source],
    ]) },
  }))
  const removeOutputMapping = (target: string) => updateTool('output_mapping', Object.fromEntries(Object.entries(draft.tool.output_mapping || {}).filter(([name]) => name !== target)))

  const renderedRequestUrl = useMemo(() => {
    const render = (value: string) => Object.entries(connectionArgs).reduce(
      (current, [name, replacement]) => current.split(`{${name}}`).join(replacement || `{${name}}`), value,
    )
    const query = Object.entries(draft.tool.request_template.query || {}).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(render(String(value)))}`).join('&')
    return `${draft.connection.base_url}${render(draft.tool.path)}${query ? `?${query}` : ''}`
  }, [draft, connectionArgs])

  const importDefinition = async () => {
    setError('')
    if (mode === 'ai') {
      setBusy(true)
      try {
        const result = await dataSourceOnboardingApi.describe(aiPrompt)
        if (!result.draft) {
          setAiMissing(result.missing_information)
          setError('Add the missing information below so AI can create the setup.')
          return
        }
        setDraft({ ...result.draft, warnings: [...(result.draft.warnings || []), ...result.missing_information] })
        setDrafts([]); setAiMissing(result.missing_information); setAiApplied(result.ai_used); setStep(1)
      } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
      return
    }
    if (mode === 'url') {
      try {
        const parsed = new URL(endpointUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a complete HTTP or HTTPS URL.')
        const placeholders = Array.from(new Set(`${parsed.pathname}${parsed.search}`.match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)?.map(value => value.slice(1, -1)) || []))
        const label = parsed.pathname.split('/').filter(Boolean).pop()?.replace(/[_-]+/g, ' ') || parsed.hostname
        const next = blankDraft()
        next.source_type = 'url'
        next.connection.name = `${parsed.hostname} connection`
        next.connection.base_url = parsed.origin
        next.tool.name = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'lookup_data'
        next.tool.display_name = label.replace(/\b\w/g, value => value.toUpperCase())
        next.tool.description = `Retrieve data from ${parsed.pathname}`
        next.tool.path = parsed.pathname || '/'
        next.tool.request_template.query = Object.fromEntries(parsed.searchParams.entries())
        next.tool.input_schema = { type: 'object', properties: Object.fromEntries(placeholders.map(name => [name, { type: 'string' }])), required: placeholders, additionalProperties: false }
        setDraft(next); setDrafts([]); setStep(1)
      } catch (e) { setError(messageOf(e)) }
      return
    }
    if (advancedMode === 'manual') { setDraft(blankDraft()); setStep(1); return }
    setBusy(true)
    try {
      const result = await dataSourceOnboardingApi.import(advancedMode, definition)
      setDrafts(result.drafts); setDraftIndex(0); setDraft(result.drafts[0]); setCredential(''); setStep(1)
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const selectOperation = (index: number) => {
    setDraftIndex(index); setDraft(drafts[index]); setCredential(''); setAiApplied(false)
  }

  const analyze = async (withAI: boolean) => {
    setError(''); setBusy(true)
    try {
      const sample = JSON.parse(sampleText)
      const result = await dataSourceOnboardingApi.analyze(draft, sample, withAI)
      if (result.ai_used) setPendingAnalysis(result)
      else { setDraft(result.draft); setObservedFields(result.observed_fields || []); setSampleSource(current => current || 'manual'); setPendingAnalysis(null); setAiApplied(false) }
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const validateConnection = async () => {
    if (!chatbotId) { setError('Select a chatbot before validating the request.'); return }
    if (inputNames.some(name => !connectionArgs[name]?.trim())) { setError('Enter a test value for every required user input.'); return }
    setError(''); setBusy(true)
    try {
      const probeDraft = { ...draft, tool: { ...draft.tool, record_path: '', output_mapping: {} } }
      const result = await dataSourceOnboardingApi.test(probeDraft, chatbotId, credential, connectionArgs)
      setConnectionTest({ ...result, fingerprint: connectionFingerprint })
      if (!result.failure) {
        const sample = result.records || []
        const analysis = await dataSourceOnboardingApi.analyze(draft, sample, false)
        setSampleText(JSON.stringify(sample, null, 2))
        setSampleSource('validated')
        setObservedFields(analysis.observed_fields || [])
        setDraft(analysis.draft)
        setPendingAnalysis(null)
        setAiApplied(false)
      }
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const saveSource = async () => {
    setError(''); setBusy(true)
    try {
      const connection = await apiClient.createDataSourceConnection({
        name: draft.connection.name, base_url: draft.connection.base_url,
        auth_type: draft.connection.auth_type, auth_header: draft.connection.auth_header,
        secret: credential || null, default_headers: draft.connection.default_headers,
      })
      const tool = await apiClient.createDataSourceTool({
        connection_id: connection.id, ...draft.tool, risk_classification: 'read', max_records: 25,
      })
      let status: 'draft' | 'active' = 'draft'
      const validationIsCurrent = !connectionTest?.failure && connectionTest?.fingerprint === connectionFingerprint
      if (chatbotId && validationIsCurrent) {
        const persistedTest = await apiClient.testDataSourceTool(tool.id, { chatbot_id: chatbotId, arguments: connectionArgs })
        if (persistedTest.outcome === 'success') {
          await apiClient.updateDataSourceConnection(connection.id, { status: 'active' })
          await apiClient.updateDataSourceTool(tool.id, { status: 'active' })
          status = 'active'
        } else {
          setError(persistedTest.failure?.message || 'The source was saved as a draft because its final validation failed.')
        }
      }
      setSavedToolId(tool.id)
      setSavedStatus(status)
      setStep(3)
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const assignAgent = async () => {
    if (!savedToolId || !chatbotId || !agentId) return
    const agent = selectableAgents.find(value => value.id === agentId)
    if (!agent) return
    setError(''); setBusy(true)
    try {
      await apiClient.replaceDataSourceAssignments(savedToolId, { chatbot_id: chatbotId, assignments: [{ agent_kind: agent.is_builtin ? 'builtin' : 'custom', agent_id: agent.id, enabled: true }] })
      onComplete()
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const canContinue = step === 1
    ? Boolean(draft.connection.name && draft.connection.base_url && (!draft.connection.credential_required || credential))
    : step === 2 ? Boolean(draft.tool.name && draft.tool.path) : true

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !busy) requestClose() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="datasource-wizard-title" className="flex h-[92vh] w-[min(1240px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-7">
        <div><div className="flex items-center gap-2"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40"><Sparkles className="h-4 w-4" /></span><div><h1 id="datasource-wizard-title" className="text-base font-semibold text-gray-950 dark:text-white">Add data source</h1><p className="text-xs text-gray-500">Connect an API and make it available to a fleet agent</p></div></div></div>
        <button aria-label="Close data source setup" onClick={requestClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"><X className="h-5 w-5" /></button>
      </header>
      <ol aria-label="Data source setup progress" className="grid shrink-0 grid-cols-4 gap-1 border-b border-gray-100 px-4 py-3 lg:hidden dark:border-gray-800">
        {STEPS.map((label, index) => <li key={label} className={`rounded-xl border p-3 text-xs ${index === step ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30' : index < step ? 'border-emerald-200 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
          <span className="block font-bold">{index < step ? <Check className="w-3 h-3 inline" /> : index + 1}</span><span className="hidden sm:block mt-1">{label}</span>
        </li>)}
      </ol>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-gray-50/70 p-5 lg:block dark:border-gray-800 dark:bg-gray-950/30">
          <ol className="space-y-2">{STEPS.map((label, index) => <li key={label} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium ${index === step ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800' : index < step ? 'text-emerald-700' : 'text-gray-400'}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${index === step ? 'bg-indigo-600 text-white' : index < step ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500 dark:bg-gray-800'}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>{label}</li>)}</ol>
          <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">The source is saved after review. Assigning it to an agent is optional.</div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto bg-gray-50/40 px-5 py-6 dark:bg-gray-950/10 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-4xl space-y-4">
            {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

            <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">
              {step === 0 && <>
                <SectionTitle title="Choose one of the following ways" help="Start in plain language, paste a complete API URL, or open advanced options when you already have technical API documentation." description="Pick the option that matches what you have. You can review every setting before anything is saved." />
                <div className="overflow-hidden rounded-2xl border border-gray-200 md:grid md:grid-cols-[220px_minmax(0,1fr)] dark:border-gray-700">
                  <div role="tablist" aria-label="Data source setup method" className="grid grid-cols-3 gap-1 border-b border-gray-200 bg-gray-50 p-2 md:grid-cols-1 md:content-start md:border-b-0 md:border-r dark:border-gray-700 dark:bg-gray-950/40">
                    {[
                      { value: 'ai', title: 'Describe your need', text: 'Use everyday language', icon: Wand2 },
                      { value: 'url', title: 'Enter API URL', text: 'Paste the full address', icon: Link2 },
                      { value: 'advanced', title: 'Advanced import', text: 'OpenAPI, cURL, or manual', icon: FileCode2 },
                    ].map(option => <button key={option.value} role="tab" aria-selected={mode === option.value} type="button" onClick={() => { setMode(option.value as typeof mode); setError('') }} className={`rounded-lg px-3 py-3 text-center transition md:text-left ${mode === option.value ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700' : 'text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:hover:bg-gray-900/60 dark:hover:text-gray-200'}`}>
                      <div className="flex flex-col items-center gap-1.5 md:flex-row md:items-start md:gap-3"><option.icon className={`h-4 w-4 shrink-0 md:mt-0.5 ${mode === option.value ? 'text-indigo-600' : 'text-gray-400'}`} /><div><span className="block text-[11px] font-semibold sm:text-xs">{option.title}</span><span className="mt-1 hidden text-[11px] leading-relaxed text-gray-500 md:block">{option.text}</span></div></div>
                    </button>)}
                  </div>
                  <div role="tabpanel" className="min-w-0 bg-white p-4 dark:bg-gray-900 sm:p-5">
                    {mode === 'ai' && <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 dark:border-violet-900 dark:from-violet-950/30 dark:to-indigo-950/20">
                      <div className="mb-3 flex items-center gap-2"><span className="rounded-lg bg-violet-600 p-2 text-white shadow-sm"><Sparkles className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-violet-950 dark:text-violet-100">Tell AI what you want to do</h3><p className="text-xs text-violet-700 dark:text-violet-300">Use everyday language. Never include passwords, API keys, or access tokens.</p></div></div>
                      <textarea aria-label="Describe the data source you need" value={aiPrompt} onChange={event => { setAiPrompt(event.target.value); setAiMissing([]); setError('') }} rows={6} className="w-full rounded-xl border-2 border-violet-300 bg-white p-4 text-sm leading-relaxed text-gray-950 shadow-inner placeholder:text-gray-500 focus:border-violet-600 focus:outline-none focus:ring-4 focus:ring-violet-500/20 dark:border-violet-700 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-400" placeholder="Example: Fetch data from xyz.com/{id}. The customer will provide the ID." />
                      <div className="mt-3 flex flex-wrap gap-2">{['Check an order status', 'Look up a customer account', 'Find shipment tracking'].map(example => <button type="button" key={example} onClick={() => setAiPrompt(example)} className="rounded-full border border-violet-200 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-white dark:border-violet-800 dark:bg-gray-900">{example}</button>)}</div>
                      {aiMissing.length > 0 && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"><strong className="block mb-1">AI still needs:</strong><ul className="list-disc space-y-1 pl-4">{aiMissing.map(item => <li key={item}>{item}</li>)}</ul></div>}
                    </div>}

                    {mode === 'url' && <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-950/30"><div className="mb-4 flex items-center gap-1"><h3 className="text-sm font-semibold">Paste the complete API URL</h3><InfoHint label="API URL">Include the full address beginning with https://. Put variable values such as order_id inside braces in the URL.</InfoHint></div><Input label="Full API URL" required value={endpointUrl} onChange={event => setEndpointUrl(event.target.value)} placeholder="https://api.example.com/v1/orders/{order_id}" /><p className="mt-2 text-[11px] leading-relaxed text-gray-500">We will separate the service address and endpoint path for you. You can add authentication on the next screen.</p></div>}

                    {mode === 'advanced' && <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-700"><div className="mb-4"><h3 className="text-sm font-semibold">Advanced setup</h3><p className="mt-1 text-xs text-gray-500">For developers or users with API documentation.</p></div><div className="mb-4 flex flex-wrap gap-2">{(['openapi', 'curl', 'manual'] as const).map(value => <button type="button" key={value} onClick={() => setAdvancedMode(value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${advancedMode === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 dark:border-gray-700'}`}>{value === 'openapi' ? 'OpenAPI file' : value === 'curl' ? 'cURL command' : 'Set up manually'}</button>)}</div>
                      {advancedMode === 'curl' && <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-semibold text-gray-900 dark:text-white">Choose an example</h4><p className="mt-1 text-[11px] text-gray-500">Replace the example address and placeholder names with values from your API documentation.</p></div><div role="tablist" className="flex rounded-lg border border-blue-200 bg-white p-1 dark:border-blue-800 dark:bg-gray-900">{(['get', 'post'] as const).map(value => <button role="tab" aria-selected={curlExample === value} type="button" key={value} onClick={() => { setCurlExample(value); setCopiedExample(false) }} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${curlExample === value ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{value.toUpperCase()}</button>)}</div></div><pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-3 text-[11px] leading-relaxed text-blue-100"><code>{CURL_EXAMPLES[curlExample]}</code></pre><div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => setDefinition(CURL_EXAMPLES[curlExample])}>Use this example</Button><button type="button" onClick={async () => { await navigator.clipboard.writeText(CURL_EXAMPLES[curlExample]); setCopiedExample(true) }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300"><Copy className="h-3.5 w-3.5" />{copiedExample ? 'Copied' : 'Copy'}</button></div><div className="mt-3 grid gap-2 text-[11px] leading-relaxed text-gray-600 sm:grid-cols-2 dark:text-gray-300"><p><strong>GET:</strong> Uses <code>{'{order_id}'}</code> in the path, a tracking query parameter, and an API-key header.</p><p><strong>POST:</strong> Sends <code>{'{customer_id}'}</code> in JSON with a bearer token and Content-Type header.</p></div><p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">API keys and tokens are removed during import. Enter the real credential securely on the next screen.</p></div>}
                      {advancedMode !== 'manual' && <><label className="mb-2 block text-xs font-semibold">{advancedMode === 'curl' ? 'Your cURL command' : 'Your OpenAPI definition'}</label><textarea aria-label="API definition" value={definition} onChange={e => setDefinition(e.target.value)} rows={8} className="w-full rounded-xl border border-gray-200 bg-transparent p-3 font-mono text-xs dark:border-gray-700" placeholder={advancedMode === 'curl' ? "Paste your GET or POST cURL command here" : 'Paste OpenAPI 3 JSON or YAML'} /></>}</div>}
                  </div>
                </div>
              </>}

              {step === 1 && <>
                <SectionTitle title="Connection identity" help="The base URL identifies the upstream service. Tool paths are appended to it later." description="Confirm where requests will be sent. Imported credentials are always removed." />
                {draft.source_type === 'ai' && <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-xs text-violet-950 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100"><div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" />AI-generated draft</div><p className="mt-1 text-violet-700 dark:text-violet-300">Review the highlighted setup. Complete the remaining items before testing.</p>{aiMissing.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{aiMissing.map(item => <li key={item}>{item}</li>)}</ul>}</div>}
                {drafts.length > 1 && <Select label="OpenAPI operation" value={String(draftIndex)} onChange={e => selectOperation(Number(e.target.value))}>{drafts.map((value, index) => <option key={`${value.tool.name}-${index}`} value={index}>{value.tool.method} {value.tool.path} — {value.tool.display_name}</option>)}</Select>}
                <div className="max-w-xl"><Input label="Connection name" required value={draft.connection.name} onChange={e => updateConnection('name', e.target.value)} /></div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/20"><div className="mb-4 flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">Generated request</h3><InfoHint label="Generated request">This is the request that will be sent. Values in braces are supplied by the user at runtime; enter temporary values here only to validate it.</InfoHint></div>
                  <div className="mb-4"><Input label="Base URL" required value={draft.connection.base_url} onChange={e => updateConnection('base_url', e.target.value)} /></div>
                  <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)]"><div><span className="text-[10px] font-bold uppercase text-gray-500">Method</span><p className="mt-2 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">{draft.tool.method}</p></div><div><span className="text-[10px] font-bold uppercase text-gray-500">Path</span><Input value={draft.tool.path} onChange={event => updateTool('path', event.target.value)} /></div></div>
                  {Object.keys(draft.tool.request_template.query || {}).length > 0 && <div className="mt-4"><span className="text-[10px] font-bold uppercase text-gray-500">Query parameters</span><div className="mt-2 grid gap-2">{Object.entries(draft.tool.request_template.query || {}).map(([key, value]) => {
                    const match = String(value).match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}$/)
                    return <div key={key} className="grid items-center gap-2 sm:grid-cols-[minmax(100px,.3fr)_auto_minmax(180px,1fr)]"><code className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">{key}</code>{match ? <><code className="rounded-md border border-emerald-200 bg-emerald-100 px-2 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-100">{String(value)}</code><Input aria-label={`Required user input for ${match[1]}`} required value={connectionArgs[match[1]] || ''} onChange={event => setConnectionArgs(current => ({ ...current, [match[1]]: event.target.value }))} placeholder="Enter test value" /></> : <div className="sm:col-span-2"><Input aria-label={`${key} query value`} value={String(value)} onChange={event => updateQuery(key, event.target.value)} /></div>}</div>
                  })}</div></div>}
                  {remainingInputNames.length > 0 && <div className="mt-4"><span className="text-[10px] font-bold uppercase text-gray-500">Other required user inputs</span><div className="mt-2 grid gap-3 sm:grid-cols-2">{remainingInputNames.map(name => <Input key={name} label={name} required value={connectionArgs[name] || ''} onChange={event => setConnectionArgs(current => ({ ...current, [name]: event.target.value }))} placeholder="Enter test value" />)}</div></div>}
                  {inputNames.length === 0 && <p className="mt-4 text-xs text-gray-500">No dynamic user inputs detected.</p>}
                  <div className="mt-4 rounded-lg bg-white p-3 dark:bg-gray-900"><span className="text-[10px] font-bold uppercase text-gray-500">Request preview</span><p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{renderedRequestUrl}</p></div>
                  <div className="mt-4 flex flex-wrap items-center gap-3"><Button size="lg" className="font-bold shadow-lg" onClick={validateConnection} loading={busy}>Validate request</Button><span className="text-[11px] text-gray-600 dark:text-gray-300">Sends one temporary request. Nothing is saved.</span></div>
                  {connectionTest && <div className={`mt-4 rounded-xl border-2 p-4 text-xs shadow-sm ${connectionTest.failure ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100' : 'border-emerald-400 bg-white text-gray-900 dark:border-emerald-600 dark:bg-gray-900 dark:text-gray-100'}`}><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-bold">Validation response</h4><div className="flex flex-wrap gap-2 font-semibold"><span className={`rounded-full px-2.5 py-1 ${connectionTest.failure ? 'bg-red-100 text-red-800 dark:bg-red-900' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'}`}>{connectionTest.failure ? 'Request failed' : 'Request succeeded'}</span>{connectionTest.status_code && <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">HTTP {connectionTest.status_code}</span>}{connectionTest.latency_ms != null && <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">{connectionTest.latency_ms} ms</span>}</div></div>{connectionTest.failure ? <p className="mt-3 rounded-lg bg-white/70 p-3 font-medium dark:bg-gray-950/40">{connectionTest.failure.message}</p> : <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-950 p-3 font-mono text-[11px] text-emerald-100 dark:border-gray-700">{JSON.stringify(connectionTest.records?.slice(0, 3) || [], null, 2)}</pre>}</div>}
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/30"><div className="mb-4 flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Authentication &amp; headers</h3><InfoHint label="Authentication and headers">The protected credential is encrypted when saved. Add non-secret request headers below as key and value rows, similar to Postman.</InfoHint></div><div className="grid md:grid-cols-3 gap-4"><Select label="Authentication type" value={draft.connection.auth_type} onChange={e => updateConnection('auth_type', e.target.value)}><option value="none">None</option><option value="bearer">Bearer token</option><option value="api_key">API key</option><option value="basic">Basic authentication</option></Select><Input label="Credential header" value={draft.connection.auth_header} onChange={e => updateConnection('auth_header', e.target.value)} /><Input type="password" label="Credential" required={draft.connection.credential_required} value={credential} onChange={e => setCredential(e.target.value)} /></div>
                  <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">Additional request headers</h4><p className="mt-1 text-[11px] text-gray-500">Add public headers such as Accept or Content-Type. Put API keys and tokens in the protected credential fields above.</p></div><Button type="button" size="sm" variant="secondary" onClick={addRequestHeader}><Plus className="h-3.5 w-3.5" /> Add header</Button></div>
                    {Object.keys(requestHeaders).length > 0 ? <div className="mt-3 grid gap-2">{Object.entries(requestHeaders).map(([key, value], index) => <div key={index} className="grid grid-cols-[minmax(120px,.8fr)_minmax(140px,1.2fr)_36px] items-center gap-2"><Input aria-label="Header key" value={key} onChange={event => updateRequestHeader(key, event.target.value, String(value))} placeholder="Header key" /><Input aria-label={`${key} header value`} value={String(value)} onChange={event => updateRequestHeader(key, key, event.target.value)} placeholder="Header value" /><button type="button" aria-label={`Remove ${key} header`} onClick={() => removeRequestHeader(key)} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button></div>)}</div> : <p className="mt-3 rounded-lg border border-dashed border-gray-200 p-3 text-center text-[11px] text-gray-500 dark:border-gray-700">No additional request headers.</p>}
                  </div>
                </div>
              </>}

              {step === 2 && <>
                <SectionTitle title="API operation" help="This becomes the function the selected agent can call. Keep the name specific and describe what information it returns." description="Review how the agent will call this endpoint and interpret its response." />
                <div className="grid md:grid-cols-2 gap-4"><Input label="Tool name" value={draft.tool.name} onChange={e => updateTool('name', e.target.value)} /><Input label="Display name" value={draft.tool.display_name} onChange={e => updateTool('display_name', e.target.value)} /></div>
                <div className="grid grid-cols-[120px_1fr] gap-4"><Select label="Method" value={draft.tool.method} onChange={e => updateTool('method', e.target.value)}><option>GET</option><option>POST</option></Select><Input label="Path" value={draft.tool.path} onChange={e => updateTool('path', e.target.value)} /></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">Validated sample response</h3><InfoHint label="Sample response">This is actual response data, not a mapping. A successful validation captures it and creates the mapping automatically. Paste JSON here only when validation is unavailable.</InfoHint></div>{sampleSource && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${sampleSource === 'validated' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'}`}>{sampleSource === 'validated' ? 'Captured from validation' : 'Pasted manually'}</span>}</div>
          <textarea aria-label="Sample API response JSON" value={sampleText} onChange={e => { setSampleText(e.target.value); setSampleSource('manual') }} rows={6} className="w-full rounded-xl border border-gray-200 bg-white p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-900" placeholder="Validation fills this automatically. Otherwise, paste a sample API response as JSON." />
          {sampleSource === 'manual' && <div className="mt-3 flex items-center gap-3"><Button size="sm" variant="secondary" onClick={() => analyze(false)} loading={busy} disabled={!sampleText.trim()}>Detect fields and create mapping</Button><span className="text-[11px] text-gray-500">Required only for a manually pasted response.</span></div>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">Agent output mapping</h3><InfoHint label="Agent output mapping">Each response field is mapped to the name exposed to the agent. Edit an output name or remove fields the agent does not need.</InfoHint></div><p className="mt-1 text-[11px] text-gray-500">Generated automatically from the validated response. Review only—no additional analysis is required.</p></div><Button size="sm" variant="secondary" onClick={() => analyze(true)} loading={busy} disabled={!sampleText.trim()}><Sparkles className="h-3.5 w-3.5" /> Improve with AI</Button></div>
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-950"><span className="text-gray-500">Detected record path:</span> <code className="ml-1 font-semibold text-gray-800 dark:text-gray-100">{draft.tool.record_path || '&lt;response root&gt;'}</code></div>
          {Object.keys(draft.tool.output_mapping || {}).length > 0 ? <div className="mt-3"><div className="mb-1 hidden grid-cols-[minmax(140px,1fr)_32px_minmax(140px,1fr)_36px] gap-2 px-1 text-[10px] font-bold uppercase text-gray-500 sm:grid"><span>Response field</span><span /><span>Agent output name</span><span /></div><div className="grid gap-2">{Object.entries(draft.tool.output_mapping || {}).map(([target, source], index) => <div key={index} className="grid items-center gap-2 sm:grid-cols-[minmax(140px,1fr)_32px_minmax(140px,1fr)_36px]"><code className="truncate rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-950" title={source}>{source}</code><span className="hidden text-center text-gray-400 sm:block">→</span><Input aria-label={`Agent output name for ${source}`} value={target} onChange={event => updateOutputMapping(target, event.target.value, source)} /><button type="button" aria-label={`Remove ${target} mapping`} onClick={() => removeOutputMapping(target)} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button></div>)}</div></div> : <div className="mt-3 rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500 dark:border-gray-700">Validate the request or paste a sample response to generate field mappings.</div>}
          {observedFields.length > 0 && <p className="mt-3 text-[11px] text-gray-500">{observedFields.length} response field{observedFields.length === 1 ? '' : 's'} detected.</p>}
        </div>
        {pendingAnalysis && <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/30 p-4 space-y-3 text-xs text-violet-700"><p><strong>AI suggestion ready.</strong> It references observed fields only and will not be applied without confirmation.</p><pre className="overflow-auto">{JSON.stringify(pendingAnalysis.draft.tool.output_mapping, null, 2)}</pre><div className="flex gap-2"><Button size="sm" onClick={() => { setDraft(pendingAnalysis.draft); setPendingAnalysis(null); setAiApplied(true) }}>Apply suggestions</Button><Button size="sm" variant="secondary" onClick={() => setPendingAnalysis(null)}>Dismiss</Button></div></div>}
                {aiApplied && <p className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-3 text-xs text-violet-700">AI-assisted suggestions applied and confirmed. Review the mapping before continuing.</p>}
                <button className="text-xs font-semibold text-indigo-600" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? 'Hide' : 'Show'} advanced JSON configuration</button>
                {showAdvanced && <div className="grid md:grid-cols-2 gap-4"><label className="text-xs font-semibold">Input schema<textarea value={JSON.stringify(draft.tool.input_schema, null, 2)} onChange={e => { try { updateTool('input_schema', JSON.parse(e.target.value)) } catch { } }} rows={9} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label><label className="text-xs font-semibold">Request template<textarea value={JSON.stringify(draft.tool.request_template, null, 2)} onChange={e => { try { updateTool('request_template', JSON.parse(e.target.value)) } catch { } }} rows={9} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label></div>}
              </>}

              {step === 3 && <><div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100"><div className="flex items-center gap-2 text-sm font-bold"><Check className="h-5 w-5" />Data source saved</div><p className="mt-1 text-xs">The tool was saved as <strong>{savedStatus === 'active' ? 'active' : 'a draft'}</strong>. Agent assignment is optional and can also be done later from the Agent page.</p></div><SectionTitle title="Assign an agent—or skip for now" help="Assignment controls which agent can call this tool. Skipping does not remove or change the saved data source." description="Choose an agent now, or finish and assign the tool later from an agent's settings." /><div className="max-w-xl"><Select label="Target Fleet Agent (optional)" value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">Select agent…</option>{selectableAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.is_builtin ? '' : ' (Custom)'}</option>)}</Select></div></>}
            </section>
          </div>
        </main>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-7">
        <div>{step > 0 && step < 3 && <Button variant="secondary" onClick={() => setStep(value => value - 1)} disabled={busy}><ChevronLeft className="w-4 h-4" /> Back</Button>}</div>
        <div className="flex flex-wrap justify-end gap-2">{step === 0 && <Button onClick={importDefinition} loading={busy} disabled={(mode === 'ai' && !aiPrompt.trim()) || (mode === 'url' && !endpointUrl.trim()) || (mode === 'advanced' && advancedMode !== 'manual' && !definition.trim())}>{mode === 'ai' ? 'Create setup with AI' : 'Continue'} <ChevronRight className="w-4 h-4" /></Button>}{step === 1 && <Button onClick={() => setStep(2)} disabled={!canContinue || busy}>Review tool <ChevronRight className="w-4 h-4" /></Button>}{step === 2 && <Button onClick={saveSource} loading={busy} disabled={!canContinue}>Save data source <ChevronRight className="w-4 h-4" /></Button>}{step === 3 && <><Button variant="secondary" onClick={onComplete} disabled={busy}>Skip for now</Button><Button onClick={assignAgent} loading={busy} disabled={!agentId || !chatbotId}>Assign agent</Button></>}</div>
      </footer>
    </div>
  </div>
}
