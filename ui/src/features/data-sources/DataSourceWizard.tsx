import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Copy, FileCode2, Link2, Sparkles, Wand2, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { apiClient } from '../../api/client'
import { dataSourceOnboardingApi } from './api'
import type { DataSourceDraft, FleetAgent } from './types'
import { InfoHint, SectionTitle } from './InfoHint'

const STEPS = ['Import', 'Connection', 'Review tool', 'Assign agents', 'Test & activate']
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
  const [testArgs, setTestArgs] = useState('{}')
  const [useAI, setUseAI] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  const [pendingAnalysis, setPendingAnalysis] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [connectionArgs, setConnectionArgs] = useState<Record<string, string>>({})
  const [connectionTest, setConnectionTest] = useState<any>(null)

  const selectableAgents = agents.filter(agent => agent.active && agent.slug !== 'triage')
  const fingerprint = useMemo(() => JSON.stringify({ draft, credential, agentId, testArgs }), [draft, credential, agentId, testArgs])
  useEffect(() => setTestResult(null), [fingerprint])
  const inputNames = Object.keys((draft.tool.input_schema?.properties || {}) as Record<string, unknown>)
  const connectionFingerprint = useMemo(() => JSON.stringify({ draft, credential, connectionArgs }), [draft, credential, connectionArgs])
  useEffect(() => setConnectionTest(null), [connectionFingerprint])
  useEffect(() => {
    if (step !== 1) return
    setConnectionArgs(current => Object.fromEntries(inputNames.map(name => [name, current[name] || ''])))
  }, [step, JSON.stringify(inputNames)])
  const hasChanges = step > 0 || Boolean(aiPrompt.trim() || endpointUrl.trim() || definition.trim() || credential || agentId || sampleText.trim())
  const requestClose = () => {
    if (!hasChanges || window.confirm('Discard this data source draft? Your entries will be lost.')) onCancel()
  }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) requestClose() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previousOverflow }
  }, [hasChanges, busy])

  const updateConnection = (field: string, value: unknown) => setDraft(current => ({
    ...current, connection: { ...current.connection, [field]: value },
  }))
  const updateTool = (field: string, value: unknown) => setDraft(current => ({
    ...current, tool: { ...current.tool, [field]: value },
  }))
  const updateQuery = (key: string, value: string) => setDraft(current => ({
    ...current,
    tool: { ...current.tool, request_template: {
      ...current.tool.request_template,
      query: { ...(current.tool.request_template.query || {}), [key]: value },
    } },
  }))

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

  const analyze = async () => {
    setError(''); setBusy(true)
    try {
      const sample = JSON.parse(sampleText)
      const result = await dataSourceOnboardingApi.analyze(draft, sample, useAI)
      if (result.ai_used) setPendingAnalysis(result)
      else { setDraft(result.draft); setPendingAnalysis(null); setAiApplied(false) }
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const validateConnection = async () => {
    if (!chatbotId) { setError('Select a chatbot before validating the request.'); return }
    if (inputNames.some(name => !connectionArgs[name]?.trim())) { setError('Enter a test value for every required user input.'); return }
    setError(''); setBusy(true)
    try {
      const result = await dataSourceOnboardingApi.test(draft, chatbotId, credential, connectionArgs)
      setConnectionTest({ ...result, fingerprint: connectionFingerprint })
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const runTest = async () => {
    if (!chatbotId) { setError('Select a chatbot before testing.'); return }
    setError(''); setBusy(true)
    try {
      const args = JSON.parse(testArgs)
      const result = await dataSourceOnboardingApi.test(draft, chatbotId, credential, args)
      setTestResult({ ...result, fingerprint })
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const activate = async () => {
    if (!chatbotId || !agentId || testResult?.failure || testResult?.fingerprint !== fingerprint) return
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
      const agent = selectableAgents.find(value => value.id === agentId)!
      await apiClient.replaceDataSourceAssignments(tool.id, { chatbot_id: chatbotId, assignments: [{ agent_kind: agent.is_builtin ? 'builtin' : 'custom', agent_id: agent.id, enabled: true }] })
      const persistedTest = await apiClient.testDataSourceTool(tool.id, { chatbot_id: chatbotId, arguments: JSON.parse(testArgs) })
      if (persistedTest.outcome !== 'success') throw new Error(persistedTest.failure?.message || 'Final test failed; the tool remains a draft.')
      await apiClient.updateDataSourceTool(tool.id, { status: 'active' })
      onComplete()
    } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }

  const canContinue = step === 1
    ? Boolean(draft.connection.name && draft.connection.base_url && (!draft.connection.credential_required || credential))
    : step === 2 ? Boolean(draft.tool.name && draft.tool.path) : step === 3 ? Boolean(agentId && chatbotId) : true

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !busy) requestClose() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="datasource-wizard-title" className="flex h-[92vh] w-[min(1240px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-7">
        <div><div className="flex items-center gap-2"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40"><Sparkles className="h-4 w-4" /></span><div><h1 id="datasource-wizard-title" className="text-base font-semibold text-gray-950 dark:text-white">Add data source</h1><p className="text-xs text-gray-500">Connect an API and make it available to a fleet agent</p></div></div></div>
        <button aria-label="Close data source setup" onClick={requestClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"><X className="h-5 w-5" /></button>
      </header>
      <ol aria-label="Data source setup progress" className="grid shrink-0 grid-cols-5 gap-1 border-b border-gray-100 px-4 py-3 lg:hidden dark:border-gray-800">
      {STEPS.map((label, index) => <li key={label} className={`rounded-xl border p-3 text-xs ${index === step ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30' : index < step ? 'border-emerald-200 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
        <span className="block font-bold">{index < step ? <Check className="w-3 h-3 inline" /> : index + 1}</span><span className="hidden sm:block mt-1">{label}</span>
      </li>)}
    </ol>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-gray-50/70 p-5 lg:block dark:border-gray-800 dark:bg-gray-950/30">
          <ol className="space-y-2">{STEPS.map((label, index) => <li key={label} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium ${index === step ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800' : index < step ? 'text-emerald-700' : 'text-gray-400'}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${index === step ? 'bg-indigo-600 text-white' : index < step ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500 dark:bg-gray-800'}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>{label}</li>)}</ol>
          <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">Draft settings stay in this modal until the final activation step.</div>
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

        {mode === 'advanced' && <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-700"><div className="mb-4"><h3 className="text-sm font-semibold">Advanced setup</h3><p className="mt-1 text-xs text-gray-500">For developers or users with API documentation.</p></div><div className="mb-4 flex flex-wrap gap-2">{(['openapi','curl','manual'] as const).map(value => <button type="button" key={value} onClick={() => setAdvancedMode(value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${advancedMode === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 dark:border-gray-700'}`}>{value === 'openapi' ? 'OpenAPI file' : value === 'curl' ? 'cURL command' : 'Set up manually'}</button>)}</div>
          {advancedMode === 'curl' && <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-semibold text-gray-900 dark:text-white">Choose an example</h4><p className="mt-1 text-[11px] text-gray-500">Replace the example address and placeholder names with values from your API documentation.</p></div><div role="tablist" className="flex rounded-lg border border-blue-200 bg-white p-1 dark:border-blue-800 dark:bg-gray-900">{(['get','post'] as const).map(value => <button role="tab" aria-selected={curlExample === value} type="button" key={value} onClick={() => { setCurlExample(value); setCopiedExample(false) }} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${curlExample === value ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{value.toUpperCase()}</button>)}</div></div><pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-3 text-[11px] leading-relaxed text-blue-100"><code>{CURL_EXAMPLES[curlExample]}</code></pre><div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => setDefinition(CURL_EXAMPLES[curlExample])}>Use this example</Button><button type="button" onClick={async () => { await navigator.clipboard.writeText(CURL_EXAMPLES[curlExample]); setCopiedExample(true) }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300"><Copy className="h-3.5 w-3.5" />{copiedExample ? 'Copied' : 'Copy'}</button></div><div className="mt-3 grid gap-2 text-[11px] leading-relaxed text-gray-600 sm:grid-cols-2 dark:text-gray-300"><p><strong>GET:</strong> Uses <code>{'{order_id}'}</code> in the path, a tracking query parameter, and an API-key header.</p><p><strong>POST:</strong> Sends <code>{'{customer_id}'}</code> in JSON with a bearer token and Content-Type header.</p></div><p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">API keys and tokens are removed during import. Enter the real credential securely on the next screen.</p></div>}
          {advancedMode !== 'manual' && <><label className="mb-2 block text-xs font-semibold">{advancedMode === 'curl' ? 'Your cURL command' : 'Your OpenAPI definition'}</label><textarea aria-label="API definition" value={definition} onChange={e => setDefinition(e.target.value)} rows={8} className="w-full rounded-xl border border-gray-200 bg-transparent p-3 font-mono text-xs dark:border-gray-700" placeholder={advancedMode === 'curl' ? "Paste your GET or POST cURL command here" : 'Paste OpenAPI 3 JSON or YAML'} /></>}</div>}
        </div>
        </div>
      </>}

      {step === 1 && <>
        <SectionTitle title="Connection identity" help="The base URL identifies the upstream service. Tool paths are appended to it later." description="Confirm where requests will be sent. Imported credentials are always removed." />
        {draft.source_type === 'ai' && <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-xs text-violet-950 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100"><div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" />AI-generated draft</div><p className="mt-1 text-violet-700 dark:text-violet-300">Review the highlighted setup. Complete the remaining items before testing.</p>{aiMissing.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{aiMissing.map(item => <li key={item}>{item}</li>)}</ul>}</div>}
        {drafts.length > 1 && <Select label="OpenAPI operation" value={String(draftIndex)} onChange={e => selectOperation(Number(e.target.value))}>{drafts.map((value, index) => <option key={`${value.tool.name}-${index}`} value={index}>{value.tool.method} {value.tool.path} — {value.tool.display_name}</option>)}</Select>}
        <div className="grid md:grid-cols-2 gap-4"><Input label="Connection name" required value={draft.connection.name} onChange={e => updateConnection('name', e.target.value)} /><Input label="Base URL" required value={draft.connection.base_url} onChange={e => updateConnection('base_url', e.target.value)} /></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/20"><div className="mb-4 flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-100">Generated request</h3><InfoHint label="Generated request">These values determine the request sent to the service. Placeholders in braces are replaced with user input at runtime.</InfoHint></div><div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)]"><div><span className="text-[10px] font-bold uppercase text-gray-500">Method</span><p className="mt-1 font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-300">{draft.tool.method}</p></div><div><span className="text-[10px] font-bold uppercase text-gray-500">Path</span><Input value={draft.tool.path} onChange={event => updateTool('path', event.target.value)} /></div></div>
          {Object.keys(draft.tool.request_template.query || {}).length > 0 && <div className="mt-4"><span className="text-[10px] font-bold uppercase text-gray-500">Query parameters</span><div className="mt-2 grid gap-2">{Object.entries(draft.tool.request_template.query || {}).map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(100px,0.35fr)_minmax(0,1fr)] items-center gap-2"><code className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">{key}</code><Input aria-label={`${key} query template`} value={String(value)} onChange={event => updateQuery(key, event.target.value)} /></div>)}</div></div>}
          <div className="mt-4"><span className="text-[10px] font-bold uppercase text-gray-500">Required user inputs</span>{inputNames.length ? <div className="mt-2 grid gap-3 sm:grid-cols-2">{inputNames.map(name => <Input key={name} label={name} required value={connectionArgs[name] || ''} onChange={event => setConnectionArgs(current => ({ ...current, [name]: event.target.value }))} placeholder={`Test value for ${name}`} />)}</div> : <p className="mt-1 text-xs text-gray-500">No dynamic inputs detected.</p>}</div>
          <div className="mt-4 rounded-lg bg-white p-3 dark:bg-gray-900"><span className="text-[10px] font-bold uppercase text-gray-500">Request preview</span><p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{renderedRequestUrl}</p></div>
          <div className="mt-4 flex items-center gap-3"><Button size="sm" variant="secondary" onClick={validateConnection} loading={busy}>Validate request</Button><span className="text-[11px] text-gray-500">Runs once without saving this data source.</span></div>
          {connectionTest && <div className={`mt-3 rounded-lg border p-3 text-xs ${connectionTest.failure ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'}`}><div className="flex flex-wrap gap-3 font-semibold"><span>{connectionTest.failure ? 'Request failed' : 'Request succeeded'}</span>{connectionTest.status_code && <span>HTTP {connectionTest.status_code}</span>}{connectionTest.latency_ms != null && <span>{connectionTest.latency_ms} ms</span>}</div>{connectionTest.failure ? <p className="mt-2">{connectionTest.failure.message}</p> : <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(connectionTest.records?.slice(0, 3) || [], null, 2)}</pre>}</div>}
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/30"><div className="mb-4 flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Authentication</h3><InfoHint label="Authentication">Credentials are encrypted when saved and are never included in import previews or AI analysis.</InfoHint></div><div className="grid md:grid-cols-3 gap-4"><Select label="Authentication type" value={draft.connection.auth_type} onChange={e => updateConnection('auth_type', e.target.value)}><option value="none">None</option><option value="bearer">Bearer token</option><option value="api_key">API key</option><option value="basic">Basic authentication</option></Select><Input label="Auth header" value={draft.connection.auth_header} onChange={e => updateConnection('auth_header', e.target.value)} /><Input type="password" label="Credential" required={draft.connection.credential_required} value={credential} onChange={e => setCredential(e.target.value)} /></div></div>
      </>}

      {step === 2 && <>
        <SectionTitle title="API operation" help="This becomes the function the selected agent can call. Keep the name specific and describe what information it returns." description="Review how the agent will call this endpoint and interpret its response." />
        <div className="grid md:grid-cols-2 gap-4"><Input label="Tool name" value={draft.tool.name} onChange={e => updateTool('name', e.target.value)} /><Input label="Display name" value={draft.tool.display_name} onChange={e => updateTool('display_name', e.target.value)} /></div>
        <div className="grid grid-cols-[120px_1fr] gap-4"><Select label="Method" value={draft.tool.method} onChange={e => updateTool('method', e.target.value)}><option>GET</option><option>POST</option></Select><Input label="Path" value={draft.tool.path} onChange={e => updateTool('path', e.target.value)} /></div>
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/30"><div className="mb-3 flex items-center gap-1"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Response mapping</h3><InfoHint label="Response mapping">Paste a representative response. Analysis finds the record list and maps common business fields without storing the sample.</InfoHint></div><textarea aria-label="Sample JSON response" value={sampleText} onChange={e => setSampleText(e.target.value)} rows={6} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white p-3 font-mono text-xs dark:bg-gray-900" placeholder="Paste a sample JSON response to infer its record path and mapping" /></div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} /> Use AI for semantic suggestions (observed fields only)</label>
        <Button variant="secondary" onClick={analyze} loading={busy} disabled={!sampleText.trim()}><Sparkles className="w-4 h-4" /> Analyze response</Button>
        {pendingAnalysis && <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/30 p-4 space-y-3 text-xs text-violet-700"><p><strong>AI suggestion ready.</strong> It references observed fields only and will not be applied without confirmation.</p><pre className="overflow-auto">{JSON.stringify(pendingAnalysis.draft.tool.output_mapping, null, 2)}</pre><div className="flex gap-2"><Button size="sm" onClick={() => { setDraft(pendingAnalysis.draft); setPendingAnalysis(null); setAiApplied(true) }}>Apply suggestions</Button><Button size="sm" variant="secondary" onClick={() => setPendingAnalysis(null)}>Dismiss</Button></div></div>}
        {aiApplied && <p className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-3 text-xs text-violet-700">AI-assisted suggestions applied and confirmed. Review the mapping before continuing.</p>}
        <button className="text-xs font-semibold text-indigo-600" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? 'Hide' : 'Show'} advanced JSON configuration</button>
        {showAdvanced && <div className="grid md:grid-cols-2 gap-4"><label className="text-xs font-semibold">Input schema<textarea value={JSON.stringify(draft.tool.input_schema, null, 2)} onChange={e => { try { updateTool('input_schema', JSON.parse(e.target.value)) } catch {} }} rows={9} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label><label className="text-xs font-semibold">Request template<textarea value={JSON.stringify(draft.tool.request_template, null, 2)} onChange={e => { try { updateTool('request_template', JSON.parse(e.target.value)) } catch {} }} rows={9} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label></div>}
        <div className="rounded-xl bg-gray-50 dark:bg-gray-950 p-3 text-xs"><strong>Record path:</strong> {draft.tool.record_path || '<root>'}<pre className="mt-2 overflow-auto">{JSON.stringify(draft.tool.output_mapping, null, 2)}</pre></div>
      </>}

      {step === 3 && <><SectionTitle title="Agent assignment" help="Only the selected active agent receives this tool. Triage and inactive agents are intentionally excluded." description="Choose who can use this data source during customer conversations." /><div className="max-w-xl"><Select label="Target Fleet Agent" required value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">Select agent…</option>{selectableAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.is_builtin ? '' : ' (Custom)'}</option>)}</Select></div></>}

      {step === 4 && <><SectionTitle title="Test and activate" help="The temporary test does not save registry rows. After it succeeds, Save and activate performs one final persisted test before activation." description="Provide realistic arguments and verify the upstream response before saving." /><label className="block text-xs font-semibold">Test arguments (JSON)<textarea value={testArgs} onChange={e => setTestArgs(e.target.value)} rows={6} className="mt-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent p-3 font-mono font-normal" /></label>{testResult && <div className={`rounded-xl p-4 text-xs ${testResult.failure ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{testResult.failure ? testResult.failure.message : `Success — ${testResult.records?.length || 0} record(s) returned.`}</div>}</>}
    </section>
          </div>
        </main>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-7">
        <div>{step > 0 && <Button variant="secondary" onClick={() => setStep(value => value - 1)} disabled={busy}><ChevronLeft className="w-4 h-4" /> Back</Button>}</div>
        <div className="flex flex-wrap justify-end gap-2">{step === 0 && <Button onClick={importDefinition} loading={busy} disabled={(mode === 'ai' && !aiPrompt.trim()) || (mode === 'url' && !endpointUrl.trim()) || (mode === 'advanced' && advancedMode !== 'manual' && !definition.trim())}>{mode === 'ai' ? 'Create setup with AI' : 'Continue'} <ChevronRight className="w-4 h-4" /></Button>}{step > 0 && step < 4 && <Button onClick={() => setStep(value => value + 1)} disabled={!canContinue || busy}>Continue <ChevronRight className="w-4 h-4" /></Button>}{step === 4 && <><Button variant="secondary" onClick={runTest} loading={busy}>Run temporary test</Button><Button onClick={activate} loading={busy} disabled={!testResult || Boolean(testResult.failure) || testResult.fingerprint !== fingerprint}>Save and activate</Button></>}</div>
      </footer>
    </div>
  </div>
}
