import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { apiClient } from '../../api/client'
import { dataSourceOnboardingApi } from './api'
import type { DataSourceDraft, FleetAgent } from './types'

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

  return <div className="max-w-5xl mx-auto p-6 space-y-6">
    <button onClick={onCancel} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-indigo-600"><ChevronLeft className="w-4 h-4" /> Back to integrations</button>
    <ol aria-label="Data source setup progress" className="grid grid-cols-5 gap-2">
      {STEPS.map((label, index) => <li key={label} className={`rounded-xl border p-3 text-xs ${index === step ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30' : index < step ? 'border-emerald-200 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
        <span className="block font-bold mb-1">{index < step ? <Check className="w-3 h-3 inline" /> : index + 1}</span>{label}
      </li>)}
    </ol>

    {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm space-y-5">
      {step === 0 && <>
        <div><h2 className="text-lg font-semibold">How would you like to start?</h2><p className="text-xs text-gray-500 mt-1">Nothing is saved until the final step.</p></div>
        <div className="flex gap-2">{(['curl','openapi','manual'] as const).map(value => <button key={value} onClick={() => setMode(value)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${mode === value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200'}`}>{value === 'curl' ? 'cURL' : value === 'openapi' ? 'OpenAPI' : 'Manual'}</button>)}</div>
        {mode !== 'manual' && <textarea aria-label="API definition" value={definition} onChange={e => setDefinition(e.target.value)} rows={10} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent p-3 font-mono text-xs" placeholder={mode === 'curl' ? "curl 'https://api.example.com/orders/{order_id}'" : 'Paste OpenAPI 3 JSON or YAML'} />}
        <Button onClick={importDefinition} loading={busy} disabled={mode !== 'manual' && !definition.trim()}>Continue <ChevronRight className="w-4 h-4" /></Button>
      </>}

      {step === 1 && <>
        <div><h2 className="text-lg font-semibold">Review connection</h2><p className="text-xs text-gray-500 mt-1">Imported secrets were removed. Enter the credential again securely.</p></div>
        {drafts.length > 1 && <Select label="OpenAPI operation" value={String(draftIndex)} onChange={e => selectOperation(Number(e.target.value))}>{drafts.map((value, index) => <option key={`${value.tool.name}-${index}`} value={index}>{value.tool.method} {value.tool.path} — {value.tool.display_name}</option>)}</Select>}
        <div className="grid md:grid-cols-2 gap-4"><Input label="Connection name" required value={draft.connection.name} onChange={e => updateConnection('name', e.target.value)} /><Input label="Base URL" required value={draft.connection.base_url} onChange={e => updateConnection('base_url', e.target.value)} /></div>
        <div className="grid md:grid-cols-3 gap-4"><Select label="Authentication" value={draft.connection.auth_type} onChange={e => updateConnection('auth_type', e.target.value)}><option value="none">None</option><option value="bearer">Bearer</option><option value="api_key">API key</option><option value="basic">Basic</option></Select><Input label="Auth header" value={draft.connection.auth_header} onChange={e => updateConnection('auth_header', e.target.value)} /><Input type="password" label="Credential" required={draft.connection.credential_required} value={credential} onChange={e => setCredential(e.target.value)} /></div>
      </>}

      {step === 2 && <>
        <div><h2 className="text-lg font-semibold">Review the agent tool</h2><p className="text-xs text-gray-500 mt-1">Analyze a sample response locally, with optional validated AI suggestions.</p></div>
        <div className="grid md:grid-cols-2 gap-4"><Input label="Tool name" value={draft.tool.name} onChange={e => updateTool('name', e.target.value)} /><Input label="Display name" value={draft.tool.display_name} onChange={e => updateTool('display_name', e.target.value)} /></div>
        <div className="grid grid-cols-[120px_1fr] gap-4"><Select label="Method" value={draft.tool.method} onChange={e => updateTool('method', e.target.value)}><option>GET</option><option>POST</option></Select><Input label="Path" value={draft.tool.path} onChange={e => updateTool('path', e.target.value)} /></div>
        <textarea aria-label="Sample JSON response" value={sampleText} onChange={e => setSampleText(e.target.value)} rows={6} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent p-3 font-mono text-xs" placeholder="Paste a sample JSON response to infer its record path and mapping" />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} /> Use AI for semantic suggestions (observed fields only)</label>
        <Button variant="secondary" onClick={analyze} loading={busy} disabled={!sampleText.trim()}><Sparkles className="w-4 h-4" /> Analyze response</Button>
        {pendingAnalysis && <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/30 p-4 space-y-3 text-xs text-violet-700"><p><strong>AI suggestion ready.</strong> It references observed fields only and will not be applied without confirmation.</p><pre className="overflow-auto">{JSON.stringify(pendingAnalysis.draft.tool.output_mapping, null, 2)}</pre><div className="flex gap-2"><Button size="sm" onClick={() => { setDraft(pendingAnalysis.draft); setPendingAnalysis(null); setAiApplied(true) }}>Apply suggestions</Button><Button size="sm" variant="secondary" onClick={() => setPendingAnalysis(null)}>Dismiss</Button></div></div>}
        {aiApplied && <p className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-3 text-xs text-violet-700">AI-assisted suggestions applied and confirmed. Review the mapping before continuing.</p>}
        <button className="text-xs font-semibold text-indigo-600" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? 'Hide' : 'Show'} advanced JSON configuration</button>
        {showAdvanced && <div className="grid md:grid-cols-2 gap-4"><label className="text-xs font-semibold">Input schema<textarea value={JSON.stringify(draft.tool.input_schema, null, 2)} onChange={e => { try { updateTool('input_schema', JSON.parse(e.target.value)) } catch {} }} rows={9} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label><label className="text-xs font-semibold">Request template<textarea value={JSON.stringify(draft.tool.request_template, null, 2)} onChange={e => { try { updateTool('request_template', JSON.parse(e.target.value)) } catch {} }} rows={9} className="mt-2 w-full rounded-xl border p-3 font-mono font-normal" /></label></div>}
        <div className="rounded-xl bg-gray-50 dark:bg-gray-950 p-3 text-xs"><strong>Record path:</strong> {draft.tool.record_path || '<root>'}<pre className="mt-2 overflow-auto">{JSON.stringify(draft.tool.output_mapping, null, 2)}</pre></div>
      </>}

      {step === 3 && <><div><h2 className="text-lg font-semibold">Assign an active fleet agent</h2><p className="text-xs text-gray-500 mt-1">Inactive and triage agents are excluded.</p></div><Select label="Target Fleet Agent" required value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">Select agent…</option>{selectableAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.is_builtin ? '' : ' (Custom)'}</option>)}</Select></>}

      {step === 4 && <><div><h2 className="text-lg font-semibold">Test and activate</h2><p className="text-xs text-gray-500 mt-1">The first test is temporary. Configuration is saved only after it succeeds.</p></div><label className="block text-xs font-semibold">Test arguments (JSON)<textarea value={testArgs} onChange={e => setTestArgs(e.target.value)} rows={6} className="mt-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent p-3 font-mono font-normal" /></label><Button variant="secondary" onClick={runTest} loading={busy}>Run temporary test</Button>{testResult && <div className={`rounded-xl p-4 text-xs ${testResult.failure ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{testResult.failure ? testResult.failure.message : `Success — ${testResult.records?.length || 0} record(s) returned.`}</div>}<Button onClick={activate} loading={busy} disabled={!testResult || Boolean(testResult.failure) || testResult.fingerprint !== fingerprint}>Save and activate</Button></>}
    </section>

    {step > 0 && step < 4 && <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(value => value - 1)}><ChevronLeft className="w-4 h-4" /> Back</Button><Button onClick={() => setStep(value => value + 1)} disabled={!canContinue}>Continue <ChevronRight className="w-4 h-4" /></Button></div>}
  </div>
}
