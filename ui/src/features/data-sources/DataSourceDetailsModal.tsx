import { useMemo, useState } from 'react'
import { Check, Edit3, Eye, Shield, X } from 'lucide-react'
import { apiClient } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'

type Mode = 'view' | 'edit'

export function DataSourceDetailsModal({ connection, tool, initialMode, onClose, onSaved }: {
  connection: any
  tool: any
  initialMode: Mode
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [connectionForm, setConnectionForm] = useState({
    name: connection.name || '', base_url: connection.base_url || '',
    auth_type: connection.auth_type || 'none', auth_header: connection.auth_header || 'Authorization',
  })
  const [toolForm, setToolForm] = useState({
    name: tool.name || '', display_name: tool.display_name || '', description: tool.description || '',
    method: tool.method || 'GET', path: tool.path || '', record_path: tool.record_path || '',
  })
  const [mappingText, setMappingText] = useState(JSON.stringify(tool.output_mapping || {}, null, 2))
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const requestUrl = `${connectionForm.base_url}${toolForm.path}`
  const query = tool.request_template?.query || {}
  const headerNames = useMemo(() => Array.from(new Set([
    ...Object.keys(connection.default_headers || {}),
    ...Object.keys(tool.request_template?.headers || {}),
  ])), [connection, tool])
  const inputNames = Object.keys(tool.input_schema?.properties || {})

  const save = async () => {
    setError(''); setBusy(true); setSaved(false)
    try {
      let mapping: Record<string, string>
      try { mapping = JSON.parse(mappingText) } catch { throw new Error('Response mapping must be valid JSON.') }
      const connectionChanges: Record<string, unknown> = {}
      for (const key of ['name', 'base_url', 'auth_type', 'auth_header'] as const) {
        if (connectionForm[key] !== (connection[key] || (key === 'auth_header' ? 'Authorization' : ''))) connectionChanges[key] = connectionForm[key]
      }
      if (credential) connectionChanges.secret = credential
      const toolChanges: Record<string, unknown> = {}
      for (const key of ['name', 'display_name', 'description', 'method', 'path', 'record_path'] as const) {
        if (toolForm[key] !== (tool[key] || '')) toolChanges[key] = toolForm[key]
      }
      if (JSON.stringify(mapping) !== JSON.stringify(tool.output_mapping || {})) toolChanges.output_mapping = mapping
      if (Object.keys(connectionChanges).length) await apiClient.updateDataSourceConnection(connection.id, connectionChanges)
      if (Object.keys(toolChanges).length) await apiClient.updateDataSourceTool(tool.id, toolChanges)
      setSaved(true)
      await onSaved()
      onClose()
    } catch (value: any) {
      setError(value?.response?.data?.detail || value?.message || 'Could not save changes.')
    } finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="datasource-details-title" className="flex max-h-[92vh] w-[min(980px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-7"><div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/40">{mode === 'view' ? <Eye className="h-5 w-5" /> : <Edit3 className="h-5 w-5" />}</span><div><h2 id="datasource-details-title" className="text-base font-bold">{mode === 'view' ? 'Data source details' : 'Edit data source'}</h2><p className="mt-0.5 text-xs text-gray-500">{tool.display_name || tool.name}</p></div></div><button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button></header>
      <main className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-gray-50/50 p-5 dark:bg-gray-950/20 sm:p-7">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{error}</div>}
        {saved && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"><Check className="h-4 w-4" />Changes saved.</div>}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-bold">Connection</h3><p className="mt-1 text-xs text-gray-500">Where this tool sends requests.</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tool.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{String(tool.status || 'draft').toUpperCase()}</span></div>
          {mode === 'edit' ? <div className="grid gap-4 sm:grid-cols-2"><Input label="Connection name" required value={connectionForm.name} onChange={event => setConnectionForm(current => ({ ...current, name: event.target.value }))} /><Input label="Base URL" required value={connectionForm.base_url} onChange={event => setConnectionForm(current => ({ ...current, base_url: event.target.value }))} /><Select label="Authentication type" value={connectionForm.auth_type} onChange={event => setConnectionForm(current => ({ ...current, auth_type: event.target.value }))}><option value="none">None</option><option value="bearer">Bearer token</option><option value="api_key">API key</option><option value="basic">Basic authentication</option></Select><Input label="Credential header" value={connectionForm.auth_header} onChange={event => setConnectionForm(current => ({ ...current, auth_header: event.target.value }))} /><div className="sm:col-span-2"><Input type="password" label="Replace credential (optional)" value={credential} onChange={event => setCredential(event.target.value)} placeholder="Leave blank to keep the existing credential" /></div></div> : <dl className="grid gap-4 text-xs sm:grid-cols-2"><div><dt className="font-semibold text-gray-500">Connection name</dt><dd className="mt-1 text-gray-900 dark:text-white">{connection.name}</dd></div><div><dt className="font-semibold text-gray-500">Base URL</dt><dd className="mt-1 break-all font-mono text-gray-900 dark:text-white">{connection.base_url}</dd></div><div><dt className="font-semibold text-gray-500">Authentication</dt><dd className="mt-1 text-gray-900 dark:text-white">{connection.auth_type || 'none'}</dd></div><div><dt className="font-semibold text-gray-500">Credential</dt><dd className="mt-1 inline-flex items-center gap-1 text-gray-600"><Shield className="h-3.5 w-3.5" />Stored securely and hidden</dd></div></dl>}
        </section>
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20"><h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-100">Request</h3><div className="mt-3 rounded-xl bg-white p-3 font-mono text-xs dark:bg-gray-900"><strong className="mr-2 text-emerald-700">{toolForm.method}</strong><span className="break-all">{requestUrl}</span></div>
          {mode === 'edit' && <div className="mt-4 grid gap-4 sm:grid-cols-[120px_1fr]"><Select label="Method" value={toolForm.method} onChange={event => setToolForm(current => ({ ...current, method: event.target.value }))}><option>GET</option><option>POST</option></Select><Input label="Path" value={toolForm.path} onChange={event => setToolForm(current => ({ ...current, path: event.target.value }))} /></div>}
          <div className="mt-4 grid gap-4 sm:grid-cols-3"><div><h4 className="text-[10px] font-bold uppercase text-gray-500">Query parameters</h4><p className="mt-2 text-xs">{Object.keys(query).length ? Object.entries(query).map(([key, value]) => <code key={key} className="mb-1 block">{key}={String(value)}</code>) : 'None'}</p></div><div><h4 className="text-[10px] font-bold uppercase text-gray-500">Required inputs</h4><p className="mt-2 text-xs">{inputNames.length ? inputNames.join(', ') : 'None'}</p></div><div><h4 className="text-[10px] font-bold uppercase text-gray-500">Request headers</h4><p className="mt-2 text-xs">{headerNames.length ? headerNames.join(', ') : 'None'}{headerNames.length ? ' (values hidden)' : ''}</p></div></div>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><h3 className="text-sm font-bold">Tool and response mapping</h3>{mode === 'edit' ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><Input label="Tool name" value={toolForm.name} onChange={event => setToolForm(current => ({ ...current, name: event.target.value }))} /><Input label="Display name" value={toolForm.display_name} onChange={event => setToolForm(current => ({ ...current, display_name: event.target.value }))} /><div className="sm:col-span-2"><label className="text-xs font-semibold">Description<textarea value={toolForm.description} onChange={event => setToolForm(current => ({ ...current, description: event.target.value }))} rows={3} className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-950" /></label></div><Input label="Record path" value={toolForm.record_path} onChange={event => setToolForm(current => ({ ...current, record_path: event.target.value }))} placeholder="Response root" /><div className="sm:col-span-2"><label className="text-xs font-semibold">Response mapping (JSON)<textarea value={mappingText} onChange={event => setMappingText(event.target.value)} rows={8} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-950 p-3 font-mono text-xs text-emerald-100 dark:border-gray-700" /></label></div></div> : <div className="mt-4 space-y-4 text-xs"><div className="grid gap-4 sm:grid-cols-2"><div><span className="font-semibold text-gray-500">Tool</span><p className="mt-1">{tool.display_name || tool.name} <code className="ml-1 text-gray-500">({tool.name})</code></p></div><div><span className="font-semibold text-gray-500">Record path</span><p className="mt-1 font-mono">{tool.record_path || '<response root>'}</p></div></div><p className="text-gray-600 dark:text-gray-300">{tool.description || 'No description provided.'}</p><pre className="max-h-64 overflow-auto rounded-xl bg-gray-950 p-3 font-mono text-[11px] text-emerald-100">{JSON.stringify(tool.output_mapping || {}, null, 2)}</pre></div>}
        </section>
      </main>
      <footer className="flex items-center justify-between border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-7"><div>{mode === 'edit' && <Button variant="ghost" onClick={() => setMode('view')} disabled={busy}>Cancel editing</Button>}</div><div className="flex gap-2">{mode === 'view' ? <><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => setMode('edit')}><Edit3 className="h-4 w-4" />Edit data source</Button></> : <Button onClick={save} loading={busy} disabled={!connectionForm.name || !connectionForm.base_url || !toolForm.name || !toolForm.path}>Save changes</Button>}</div></footer>
    </div>
  </div>
}
