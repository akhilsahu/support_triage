import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { apiClient } from '../../api/client'
import { dataSourceOnboardingApi } from './api'
import type { DataSourceDraft, FleetAgent } from './types'
import { InfoHint, SectionTitle } from './InfoHint'

const STEPS = ['Import', 'Connection', 'Review tool', 'Assign agents', 'Test & activate']

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
  const [mode, setMode] = useState<'curl' | 'openapi' | 'manual'>('curl')
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

  const selectableAgents = agents.filter(agent => agent.active && agent.slug !== 'triage')
  const fingerprint = useMemo(() => JSON.stringify({ draft, credential, agentId, testArgs }), [draft, credential, agentId, testArgs])
  useEffect(() => setTestResult(null), [fingerprint])
  const hasChanges = step > 0 || Boolean(definition.trim() || credential || agentId || sampleText.trim())
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

  const importDefinition = async () => {
    setError('')
    if (mode === 'manual') { setDraft(blankDraft()); setStep(1); return }
    setBusy(true)
    try {
      const result = await dataSourceOnboardingApi.import(mode, definition)
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
        <SectionTitle title="Choose a starting point" help="Importing saves time by extracting the URL, operation, parameters, and authentication type. You will review every value before saving." description="Use an existing API definition, or configure the connection manually." />
        <div className="flex gap-2">{(['curl','openapi','manual'] as const).map(value => <button key={value} onClick={() => setMode(value)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${mode === value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200'}`}>{value === 'curl' ? 'cURL' : value === 'openapi' ? 'OpenAPI' : 'Manual'}</button>)}</div>
        {mode !== 'manual' && <textarea aria-label="API definition" value={definition} onChange={e => setDefinition(e.target.value)} rows={10} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent p-3 font-mono text-xs" placeholder={mode === 'curl' ? "curl 'https://api.example.com/orders/{order_id}'" : 'Paste OpenAPI 3 JSON or YAML'} />}
      </>}

      {step === 1 && <>
        <SectionTitle title="Connection identity" help="The base URL identifies the upstream service. Tool paths are appended to it later." description="Confirm where requests will be sent. Imported credentials are always removed." />
        {drafts.length > 1 && <Select label="OpenAPI operation" value={String(draftIndex)} onChange={e => selectOperation(Number(e.target.value))}>{drafts.map((value, index) => <option key={`${value.tool.name}-${index}`} value={index}>{value.tool.method} {value.tool.path} — {value.tool.display_name}</option>)}</Select>}
        <div className="grid md:grid-cols-2 gap-4"><Input label="Connection name" required value={draft.connection.name} onChange={e => updateConnection('name', e.target.value)} /><Input label="Base URL" required value={draft.connection.base_url} onChange={e => updateConnection('base_url', e.target.value)} /></div>
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
        <div className="flex flex-wrap justify-end gap-2">{step === 0 && <Button onClick={importDefinition} loading={busy} disabled={mode !== 'manual' && !definition.trim()}>Continue <ChevronRight className="w-4 h-4" /></Button>}{step > 0 && step < 4 && <Button onClick={() => setStep(value => value + 1)} disabled={!canContinue || busy}>Continue <ChevronRight className="w-4 h-4" /></Button>}{step === 4 && <><Button variant="secondary" onClick={runTest} loading={busy}>Run temporary test</Button><Button onClick={activate} loading={busy} disabled={!testResult || Boolean(testResult.failure) || testResult.fingerprint !== fingerprint}>Save and activate</Button></>}</div>
      </footer>
    </div>
  </div>
}
