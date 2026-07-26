import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, Trash2, FileText, AlertCircle, RefreshCw, X, Plus,
  Eye, Loader2, ChevronDown, ChevronUp, ChevronLeft,
  MessageSquare, Type, Database, Check, List,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { apiClient, INGESTION_TERMINAL, type IngestionJob } from '../api/client'
import { IngestionJobRow } from '../components/kb/IngestionJobRow'
import { CreateAgentModal } from './Agents'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KB {
  id: string
  name: string
  description: string
  active: boolean
  item_count: number
  created_at?: string
}

interface KBItem {
  id: string
  kb_id: string
  item_type: 'doc' | 'text' | 'qna'
  title?: string
  doc_id?: string
  question?: string
  content?: string
  indexed_doc_id?: string
  created_at?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white'
const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

// ── Chunks Modal ──────────────────────────────────────────────────────────────

interface Chunk { chunk_index: number; page: number; section: string; text: string }

function ChunksModal({ docId, docName, onClose }: { docId: string; docName: string; onClose: () => void }) {
  const [chunks, setChunks]     = useState<Chunk[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useState(() => {
    apiClient.getDocChunks(docId)
      .then(data => setChunks(data.chunks || []))
      .catch(() => setError('Failed to load chunks.'))
      .finally(() => setLoading(false))
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Chunks — {docName}</h3>
            {!loading && <p className="text-xs text-gray-500 mt-0.5">{chunks.length} chunks</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {loading && <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && chunks.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No chunks found.</p>}
          {chunks.map((chunk, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 text-left transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 w-6 text-right">#{i + 1}</span>
                  <span className="text-xs text-gray-500">Page {chunk.page}</span>
                  {chunk.section && <span className="text-xs text-gray-400 truncate max-w-[200px]">· {chunk.section}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{chunk.text.length} chars</span>
                  {expanded === i ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </div>
              </button>
              {expanded === i && (
                <div className="px-4 py-3 bg-white dark:bg-gray-900">
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">{chunk.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Upload / Add Item Modal ────────────────────────────────────────────────────

type ItemTab = 'doc' | 'text' | 'qna'

function KBModal({
  kbId,
  onClose,
  onDone,
  defaultTab,
}: {
  kbId?: string | null
  onClose: () => void
  onDone: (kb: KB) => void
  defaultTab?: ItemTab
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab]           = useState<ItemTab>(defaultTab || 'doc')
  const [kbName, setKbName]     = useState('')
  const [title, setTitle]       = useState('')
  const [docType, setDocType]   = useState('general')
  const [expiryDate, setExpiryDate] = useState('')
  const [question, setQuestion] = useState('')
  const [content, setContent]   = useState('')
  const [file, setFile]         = useState<File | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const isNew = !kbId

  const tabs: { id: ItemTab; label: string; icon: React.ReactNode }[] = [
    { id: 'doc',  label: 'Document', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text',     icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'qna',  label: 'Q & A',    icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ]

  const handleSubmit = async () => {
    setError('')
    if (tab === 'doc' && !file) { setError('Please select a file to upload.'); return }
    if (tab === 'text' && !content.trim()) { setError('Content is required.'); return }
    if (tab === 'qna' && (!question.trim() || !content.trim())) { setError('Question and answer are required.'); return }

    setSaving(true)
    try {
      let resolvedKbId = kbId || ''
      let kb: KB | null = null

      if (isNew) {
        const autoName = kbName.trim()
          || title.trim()
          || (file ? file.name.replace(/\.[^.]+$/, '') : '')
          || (tab === 'qna' ? question.slice(0, 40) : '')
          || 'Knowledge Base'
        const newKb = await apiClient.createKB({ name: autoName })
        kb = newKb
        resolvedKbId = newKb.id
      }

      if (tab === 'doc' && file) {
        // Ingestion is asynchronous now, so there's no doc_id yet. The upload
        // carries the KB id and the background job creates the item once the
        // document is actually indexed; until then it shows as "processing" in
        // the listing, driven by the ingestion job.
        await apiClient.uploadDoc(
          file, undefined, docType, kbName || title || file.name,
          undefined, expiryDate || undefined, resolvedKbId, title || file.name,
        )
      } else if (tab === 'text') {
        await apiClient.addKBItem(resolvedKbId, { item_type: 'text', title: title || undefined, content: content.trim() })
      } else if (tab === 'qna') {
        await apiClient.addKBItem(resolvedKbId, { item_type: 'qna', question: question.trim(), content: content.trim() })
      }

      onDone(kb || { id: resolvedKbId, name: '', description: '', active: true, item_count: 1 })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isNew ? 'New Knowledge Base' : 'Add Item'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setError('') }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-3">
          {isNew && (
            <input type="text" value={kbName} onChange={e => setKbName(e.target.value)}
              placeholder="Knowledge base name (optional — auto-generated if blank)" className={inputCls} />
          )}

          {tab === 'doc' && (
            <>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.docx" className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)} />
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl p-5 text-center cursor-pointer transition-colors bg-gray-50 dark:bg-gray-800/50">
                {file
                  ? <div className="flex items-center justify-center gap-2 text-sm text-indigo-600 dark:text-indigo-400"><FileText className="w-4 h-4" />{file.name}</div>
                  : <><Upload className="w-5 h-5 text-gray-400 mx-auto mb-1.5" /><p className="text-xs font-medium text-gray-600 dark:text-gray-300">Click to select file</p><p className="text-xs text-gray-400 mt-0.5">PDF · TXT · MD · DOCX</p></>
                }
              </div>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Document name (optional)" className={inputCls} />
              <select value={docType} onChange={e => setDocType(e.target.value)} className={inputCls}>
                <option value="general">General</option>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="manual">Manual</option>
                <option value="product">Product</option>
              </select>
              <div>
                <label className={labelCls}>Expiry date (optional)</label>
                <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inputCls} />
              </div>
            </>
          )}

          {tab === 'text' && (
            <>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Title (optional)" className={inputCls} />
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="Paste plain text or Markdown…" rows={8}
                className={`${inputCls} resize-none font-mono text-xs`} />
              <p className="text-xs text-gray-400">{content.length} chars · Markdown supported</p>
            </>
          )}

          {tab === 'qna' && (
            <>
              <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
                placeholder="Question *" className={inputCls} autoFocus />
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="Answer *" rows={5} className={`${inputCls} resize-none`} />
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-colors">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {isNew ? 'Creating…' : 'Adding…'}</>
              : isNew ? <><Plus className="w-4 h-4" /> Create</> : <><Plus className="w-4 h-4" /> Add</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk Q&A Import Modal ─────────────────────────────────────────────────────

function BulkQnaModal({ kbId, onClose, onDone }: { kbId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [preview, setPreview] = useState<{ q: string; a: string }[]>([])

  const parse = (raw: string) => {
    const pairs: { q: string; a: string }[] = []
    const blocks = raw.trim().split(/\n{2,}/)
    for (const block of blocks) {
      const lines = block.trim().split('\n')
      let q = '', a = ''
      for (const line of lines) {
        if (/^Q:/i.test(line)) q = line.replace(/^Q:\s*/i, '').trim()
        else if (/^A:/i.test(line)) a = line.replace(/^A:\s*/i, '').trim()
      }
      if (q && a) pairs.push({ q, a })
    }
    return pairs
  }

  const handlePreview = () => {
    const pairs = parse(text)
    if (!pairs.length) { setError('No valid Q&A pairs found. Use format:\nQ: question\nA: answer'); return }
    setError('')
    setPreview(pairs)
  }

  const handleImport = async () => {
    setSaving(true)
    try {
      for (const pair of preview) {
        await apiClient.addKBItem(kbId, { item_type: 'qna', question: pair.q, content: pair.a })
      }
      onDone()
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bulk Import Q&A</h3>
            <p className="text-xs text-gray-400 mt-0.5">One pair per block, separated by blank line</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {preview.length === 0 ? (
            <>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 text-xs text-gray-500 font-mono leading-relaxed">
                Q: What is your return policy?{'\n'}A: We accept returns within 30 days.{'\n\n'}Q: How do I track my order?{'\n'}A: Use the tracking link in your confirmation email.
              </div>
              <textarea
                value={text}
                onChange={e => { setText(e.target.value); setError('') }}
                placeholder={'Q: Your question here\nA: Your answer here\n\nQ: Another question\nA: Another answer'}
                rows={12}
                className={`${inputCls} resize-none font-mono text-xs`}
              />
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{preview.length} pairs ready to import</p>
              {preview.map((p, i) => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Q: {p.q}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">A: {p.a}</p>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-600 dark:text-red-400 whitespace-pre-line">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          {preview.length === 0
            ? <button onClick={handlePreview} disabled={!text.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-colors">
                <Eye className="w-4 h-4" /> Preview
              </button>
            : <>
                <button onClick={() => setPreview([])} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Back</button>
                <button onClick={handleImport} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-colors">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Check className="w-4 h-4" /> Import {preview.length} pairs</>}
                </button>
              </>
          }
        </div>
      </div>
    </div>
  )
}

// ── Inline editable Q&A item ──────────────────────────────────────────────────

function QnaItem({ item, kbId, onDelete }: { item: KBItem; kbId: string; onDelete: () => void }) {
  const [question, setQuestion] = useState(item.question || '')
  const [answer, setAnswer]     = useState(item.content  || '')
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await apiClient.updateKBItem(kbId, item.id, { question, content: answer })
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Q:</label>
        <textarea
          value={question}
          onChange={e => { setQuestion(e.target.value); setDirty(true); setSaved(false) }}
          onBlur={save}
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">A:</label>
        <textarea
          value={answer}
          onChange={e => { setAnswer(e.target.value); setDirty(true); setSaved(false) }}
          onBlur={save}
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-xs">
          {saving && <><Loader2 className="w-3 h-3 animate-spin text-gray-400" /><span className="text-gray-400">Saving…</span></>}
          {saved  && <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>}
          {dirty && !saving && !saved && <span className="text-amber-500">Unsaved</span>}
        </div>
        <button onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  )
}

// ── KB Detail view (tabbed) ───────────────────────────────────────────────────

type DetailTab = 'docs' | 'text' | 'qna'

function KBDetail({ kb, onBack }: { kb: KB; onBack: () => void }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab]       = useState<DetailTab>('docs')
  const [addOpen, setAddOpen]           = useState(false)
  const [bulkOpen, setBulkOpen]         = useState(false)
  const [agentModal, setAgentModal]     = useState(false)
  const [viewChunks, setViewChunks]     = useState<{ docId: string; name: string } | null>(null)

  const { data: items, isLoading } = useQuery<KBItem[]>({
    queryKey: ['kb-items', kb.id],
    queryFn: () => apiClient.listKBItems(kb.id),
  })

  // Documents still ingesting (or failed) for this KB. Ingestion runs in the
  // background, so this is what makes a large upload visible instead of the
  // page looking empty for minutes. Polls only while something is unfinished,
  // then goes quiet.
  const { data: jobsData } = useQuery<{ jobs: IngestionJob[] }>({
    queryKey: ['ingestion-jobs', kb.id],
    queryFn: () => apiClient.listIngestionJobs(50),
    refetchInterval: q => {
      const list = (q.state.data as { jobs: IngestionJob[] } | undefined)?.jobs ?? []
      const mine = list.filter(j => j.kb_id === kb.id)
      return mine.some(j => !INGESTION_TERMINAL.includes(j.status)) ? 2000 : false
    },
  })

  // Failures stay visible so the user knows the upload didn't land; successes
  // vanish because the finished document itself takes their place in the list.
  const activeJobs = (jobsData?.jobs ?? []).filter(
    j => j.kb_id === kb.id && j.status !== 'done',
  )

  // Pull in the real document as soon as its job finishes.
  const doneCount = (jobsData?.jobs ?? []).filter(j => j.kb_id === kb.id && j.status === 'done').length
  useEffect(() => {
    if (doneCount > 0) queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] })
  }, [doneCount, kb.id, queryClient])

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => apiClient.deleteKBItem(kb.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] }),
  })

  const docs  = items?.filter(i => i.item_type === 'doc')  || []
  const texts = items?.filter(i => i.item_type === 'text') || []
  const qnas  = items?.filter(i => i.item_type === 'qna')  || []

  const tabs: { id: DetailTab; label: string; count: number }[] = [
    { id: 'docs', label: 'Documents', count: docs.length },
    { id: 'text', label: 'Text',      count: texts.length },
    { id: 'qna',  label: 'Q & A',     count: qnas.length },
  ]

  const tabToItemTab: Record<DetailTab, ItemTab> = { docs: 'doc', text: 'text', qna: 'qna' }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{kb.name}</h2>
            {!kb.active && <Badge variant="danger">inactive</Badge>}
          </div>
          {kb.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{kb.description}</p>}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {activeTab === 'qna' && (
            <button onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <List className="w-3.5 h-3.5" /> Bulk Import
            </button>
          )}
          <button onClick={() => setAgentModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Create Agent
          </button>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            {activeTab === 'docs' ? <><Upload className="w-4 h-4" /> Upload</> : <><Plus className="w-4 h-4" /> Add</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {t.label}
            {!isLoading && <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
              activeTab === t.id ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            }`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {isLoading && (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      )}

      {/* Docs tab */}
      {!isLoading && activeTab === 'docs' && (
        <>
          {activeJobs.length > 0 && (
            <div className="space-y-2 mb-2">
              {activeJobs.map(j => <IngestionJobRow key={j.id} job={j} />)}
            </div>
          )}
          {docs.length === 0 && activeJobs.length === 0
            ? <EmptyState label="No documents yet" cta="Upload" onCta={() => setAddOpen(true)} />
            : <div className="space-y-2">
                {docs.map(item => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title || item.doc_id}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">doc_id: {item.doc_id}</p>
                        {item.created_at && <p className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.doc_id && (
                          <button onClick={() => setViewChunks({ docId: item.doc_id!, name: item.title || item.doc_id! })}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View chunks">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
          }
        </>
      )}

      {/* Text tab */}
      {!isLoading && activeTab === 'text' && (
        <>
          {texts.length === 0
            ? <EmptyState label="No text entries yet" cta="Add Text" onCta={() => setAddOpen(true)} />
            : <div className="space-y-2">
                {texts.map(item => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Type className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {item.title && <p className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">{item.title}</p>}
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">{item.content}</p>
                        {item.created_at && <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>}
                      </div>
                      <button onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
          }
        </>
      )}

      {/* Q&A tab */}
      {!isLoading && activeTab === 'qna' && (
        <>
          {qnas.length === 0
            ? <EmptyState label="No Q&A pairs yet" cta="Add Q&A" onCta={() => setAddOpen(true)} />
            : <div className="space-y-3">
                {qnas.map(item => (
                  <QnaItem key={item.id} item={item} kbId={kb.id}
                    onDelete={() => deleteMutation.mutate(item.id)} />
                ))}
              </div>
          }
        </>
      )}

      {/* Modals */}
      {addOpen && (
        <KBModal
          kbId={kb.id}
          defaultTab={tabToItemTab[activeTab]}
          onClose={() => setAddOpen(false)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] })
            // A document upload only returns a job id -- refetch the job list so
            // the new "processing" row appears and polling restarts (it's idle
            // whenever nothing is in flight).
            queryClient.invalidateQueries({ queryKey: ['ingestion-jobs', kb.id] })
            setAddOpen(false)
          }}
        />
      )}

      {bulkOpen && (
        <BulkQnaModal
          kbId={kb.id}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] })
            setBulkOpen(false)
          }}
        />
      )}

      {viewChunks && (
        <ChunksModal docId={viewChunks.docId} docName={viewChunks.name} onClose={() => setViewChunks(null)} />
      )}

      {agentModal && (
        <CreateAgentModal
          onClose={() => setAgentModal(false)}
          onCreated={() => setAgentModal(false)}
          prefill={{ kb_ids: [kb.id] }}
        />
      )}
    </div>
  )
}

// ── Empty state helper ────────────────────────────────────────────────────────

function EmptyState({ label, cta, onCta }: { label: string; cta: string; onCta: () => void }) {
  return (
    <Card className="p-12 text-center">
      <Database className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">{label}</p>
      <button onClick={onCta}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
        <Plus className="w-4 h-4" /> {cta}
      </button>
    </Card>
  )
}

// ── KB List view ──────────────────────────────────────────────────────────────

export function KnowledgeBase() {
  const queryClient = useQueryClient()
  const [selectedKB, setSelectedKB]     = useState<KB | null>(null)
  const [createOpen, setCreateOpen]     = useState(false)
  const [agentModalKb, setAgentModalKb] = useState<KB | null>(null)

  const { data: kbs, isLoading, isError, refetch } = useQuery<KB[]>({
    queryKey: ['knowledge-bases'],
    queryFn: () => apiClient.listKBs(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteKB(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] }),
  })

  if (selectedKB) {
    return <KBDetail kb={selectedKB} onBack={() => setSelectedKB(null)} />
  }

  return (
    <div className="p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setAgentModalKb({ id: '', name: '', description: '', active: true, item_count: 0 })}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <Plus className="w-4 h-4" /> Create Agent
        </button>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
          <Plus className="w-4 h-4" /> New Knowledge Base
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">Could not load knowledge bases.</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && (!kbs || kbs.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <Database className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No knowledge bases yet</p>
          <p className="text-xs text-gray-400 mb-5">Create one and add documents, text, or Q&A pairs</p>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            <Plus className="w-4 h-4" /> New Knowledge Base
          </button>
        </div>
      )}

      {/* Table */}
      {kbs && kbs.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_120px_140px] gap-4 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Items</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Actions</span>
          </div>

          {/* Rows */}
          {kbs.map((kb, i) => (
            <div key={kb.id}
              onClick={() => setSelectedKB(kb)}
              className={`group grid grid-cols-[1fr_80px_120px_140px] gap-4 px-4 py-3 items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                i < kbs.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/60' : ''
              }`}>
              {/* Name */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{kb.name}</span>
                    {!kb.active && <Badge variant="danger">inactive</Badge>}
                  </div>
                  {kb.description && (
                    <p className="text-xs text-gray-400 truncate">{kb.description}</p>
                  )}
                </div>
              </div>

              {/* Items */}
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {kb.item_count} <span className="text-xs text-gray-400">item{kb.item_count !== 1 ? 's' : ''}</span>
              </span>

              {/* Created */}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {kb.created_at ? new Date(kb.created_at).toLocaleDateString() : '—'}
              </span>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setAgentModalKb(kb)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors opacity-0 group-hover:opacity-100">
                  + Agent
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${kb.name}"?`)) deleteMutation.mutate(kb.id) }}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSelectedKB(kb)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <KBModal
          kbId={null}
          onClose={() => setCreateOpen(false)}
          onDone={kb => {
            queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
            setCreateOpen(false)
            setSelectedKB(kb)
            setAgentModalKb(kb)   // auto-show agent creation with this KB pre-selected
          }}
        />
      )}

      {agentModalKb !== null && (
        <CreateAgentModal
          onClose={() => setAgentModalKb(null)}
          onCreated={() => setAgentModalKb(null)}
          prefill={agentModalKb.id ? { kb_ids: [agentModalKb.id] } : undefined}
        />
      )}
    </div>
  )
}
