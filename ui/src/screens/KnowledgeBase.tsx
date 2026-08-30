import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, Trash2, FileText, AlertCircle, RefreshCw, X, Plus,
  Eye, Loader2, ChevronDown, ChevronUp, ChevronLeft,
  MessageSquare, Type, Database, Check, List, Globe, Sparkles, Edit3, Tag,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { ExtractedFactsModal } from '../components/kb/ExtractedFactsModal'
import { apiClient, INGESTION_TERMINAL, type IngestionJob, type PreviewMode, type UrlPreview } from '../api/client'
import { IngestionJobRow } from '../components/kb/IngestionJobRow'
import { TopicPicker } from '../components/kb/TopicPicker'
import { FactsTab } from '../components/kb/FactsTab'
import { TagInput } from '../components/kb/TagInput'
import { CreateAgentModal } from './Agents'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { Button } from '../components/ui/Button'
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
  item_type: 'doc' | 'url' | 'text' | 'qna'
  title?: string
  doc_id?: string
  // Owner-supplied grouping. `topic` collects the documents describing one
  // thing so an agent can scope to it; `doc_label` names this document within
  // that topic and becomes the citation label.
  topic?: string | null
  doc_label?: string | null
  description?: string | null
  question?: string
  content?: string
  indexed_doc_id?: string
  context_enriched?: boolean
  ai_cost_usd?: number
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full h-full max-w-4xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
              🧩
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Chunks — {docName}</h2>
              {!loading && <p className="text-xs text-gray-500 dark:text-gray-400">{chunks.length} chunks</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-3 min-h-0">
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
      </motion.div>
    </motion.div>
  )
}

// ── Upload / Add Item Modal ────────────────────────────────────────────────────

type ItemTab = 'doc' | 'text' | 'qna' | 'url'

export function KBModal({
  kbId,
  onClose,
  onDone,
  defaultTab,
  onSwitchToBulk,
}: {
  kbId?: string | null
  onClose: () => void
  onDone: (kb: KB) => void
  defaultTab?: ItemTab
  onSwitchToBulk?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab]           = useState<ItemTab>(defaultTab || 'doc')
  const [kbName, setKbName]     = useState('')
  const [title, setTitle]       = useState('')
  const [docType, setDocType]   = useState('general')
  const [expiryDate, setExpiryDate] = useState('')
  const [question, setQuestion] = useState('')
  const [content, setContent]   = useState('')
  const [qnas, setQnas]         = useState<Array<{ question: string; answer: string }>>([{ question: '', answer: '' }])
  const [url, setUrl]           = useState('')
  const currentUrlRef = useRef('')
  const [file, setFile]         = useState<File | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  // URL tab: fetched-but-not-yet-indexed page. Null until the user previews;
  // cleared whenever the URL changes so a stale preview can't be confirmed.
  const [quickPreview, setQuickPreview] = useState<UrlPreview | null>(null)
  const [deepPreview, setDeepPreview] = useState<UrlPreview | null>(null)
  const [selectedPreviewMode, setSelectedPreviewMode] = useState<PreviewMode>('quick')
  const selectedPreview = selectedPreviewMode === 'deep' ? deepPreview : quickPreview
  const [previewing, setPreviewing]   = useState(false)
  const [deepPreviewing, setDeepPreviewing] = useState(false)
  const [previewProgress, setPreviewProgress] = useState(0)
  const [previewStage, setPreviewStage]       = useState('Connecting to web server…')
  const [previewError, setPreviewError]       = useState('')
  const [deepPreviewError, setDeepPreviewError] = useState('')
  const [visibleChars, setVisibleChars]       = useState(10000)

  useEffect(() => {
    setVisibleChars(10000)
  }, [selectedPreview])

  const [docPreview, setDocPreview] = useState<UrlPreview | null>(null)
  const [docPreviewing, setDocPreviewing] = useState(false)
  const [docPreviewError, setDocPreviewError] = useState('')
  const [docVisibleChars, setDocVisibleChars] = useState(10000)

  useEffect(() => {
    setDocVisibleChars(10000)
  }, [docPreview])

  useEffect(() => {
    setDocPreview(null)
    setDocPreviewError('')
  }, [file])

  const handleDocPreview = async (selectedFile: File) => {
    setDocPreviewing(true)
    setDocPreviewError('')
    try {
      const result = await apiClient.previewDoc(selectedFile)
      setDocPreview(result)
    } catch (e: any) {
      setDocPreviewError(e?.response?.data?.detail || 'Failed to extract document content for preview.')
    } finally {
      setDocPreviewing(false)
    }
  }

  const [description, setDescription] = useState('')
  const [topic, setTopic]             = useState('')
  const [docLabels, setDocLabels]     = useState<string[]>([])
  const [generatingMeta, setGeneratingMeta] = useState(false)

  const isNew = !kbId

  const tabs: { id: ItemTab; label: string; icon: React.ReactNode }[] = [
    { id: 'doc',  label: 'Document', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'url',  label: 'URL',      icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text',     icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'qna',  label: 'Q & A',    icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ]

  const isValidUrl = (u: string) => /^https?:\/\/\S+\.\S+/i.test(u.trim())

  const handlePreview = async () => {
    setError('')
    setPreviewError('')
    setDeepPreviewError('')
    setQuickPreview(null)
    setDeepPreview(null)
    setSelectedPreviewMode('quick')
    if (!isValidUrl(url)) { setError('Enter a full URL starting with http:// or https://'); return }
    const requestedUrl = url.trim()
    currentUrlRef.current = requestedUrl
    setPreviewing(true)
    setPreviewProgress(15)
    setPreviewStage('Connecting to target web server…')

    const t1 = setTimeout(() => { setPreviewProgress(40); setPreviewStage('Downloading HTML page content & assets…') }, 800)
    const t2 = setTimeout(() => { setPreviewProgress(70); setPreviewStage('Parsing text structure & extracting content…') }, 2200)
    const t3 = setTimeout(() => { setPreviewProgress(90); setPreviewStage('Generating preview snippet & metadata…') }, 4200)

    try {
      const res = await apiClient.previewUrl(requestedUrl, 'quick')
      if (currentUrlRef.current !== requestedUrl) return
      setPreviewProgress(100)
      setQuickPreview(res)
      if (res.title && !title.trim()) {
        setTitle(res.title)
      }
    } catch (e: any) {
      if (currentUrlRef.current !== requestedUrl) return
      setPreviewError(e?.response?.data?.detail || e?.message || 'Could not fetch that URL.')
    } finally {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setPreviewing(false)
    }
  }

  const handleDeepPreview = async () => {
    const requestedUrl = url.trim()
    currentUrlRef.current = requestedUrl
    setDeepPreviewError('')
    setDeepPreviewing(true)
    try {
      const res = await apiClient.previewUrl(requestedUrl, 'deep')
      if (currentUrlRef.current !== requestedUrl) return
      setDeepPreview(res)
      setSelectedPreviewMode('deep')
    } catch (e: any) {
      if (currentUrlRef.current !== requestedUrl) return
      setDeepPreviewError(e?.response?.data?.detail || e?.message || 'Could not generate a deep preview.')
    } finally {
      setDeepPreviewing(false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLPreElement>) => {
    const target = e.currentTarget
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
      if (selectedPreview && visibleChars < selectedPreview.extract.length) {
        setVisibleChars(prev => Math.min(prev + 15000, selectedPreview.extract.length))
      }
    }
  }


  const handleGenerateMeta = async () => {
    setError('')
    setGeneratingMeta(true)
    try {
      let fileSnippet = ''
      if (tab === 'doc' && file) {
        try {
          const raw = await file.slice(0, 4000).text()
          fileSnippet = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').slice(0, 2000)
        } catch (err) {
          console.warn('Could not read file snippet for metadata generation:', err)
        }
      }

      const payload: { doc_id?: string; item_id?: string; filename?: string; title?: string; url?: string; content?: string; file?: File } = {}
      if (tab === 'doc' && file) {
        payload.file = file
        payload.filename = file.name
      }
      if (title.trim()) payload.title = title.trim()
      if (url.trim()) payload.url = url.trim()

      const snippet = content.trim() || fileSnippet || selectedPreview?.extract || question.trim()
      if (snippet) payload.content = snippet

      const res = await apiClient.suggestDocMetadata(payload)
      if (res.description) setDescription(res.description)
      if (res.topic) setTopic(res.topic)
      if (res.tags && res.tags.length > 0) setDocLabels(res.tags)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not generate metadata suggestions.')
    } finally {
      setGeneratingMeta(false)
    }
  }

  const handleSubmit = async () => {
    setError('')
    if (tab === 'doc') {
      if (!file) { setError('Please select a file to upload.'); return }
      if (!docPreview) { setError('Please wait for the document preview to load.'); return }
    }
    if (tab === 'text' && !content.trim()) { setError('Content is required.'); return }
    if (tab === 'qna') {
      const validQnas = qnas.filter(q => q.question.trim() && q.answer.trim())
      if (validQnas.length === 0) {
        setError('At least one complete Question and Answer is required.');
        return
      }
      const incomplete = qnas.some(q => (q.question.trim() && !q.answer.trim()) || (!q.question.trim() && q.answer.trim()))
      if (incomplete) {
        setError('Please complete all Q&A pairs that have been started.');
        return
      }
    }
    if (tab === 'url') {
      const u = url.trim()
      if (!u) { setError('URL is required.'); return }
      // Fail here rather than at the API: the backend rejects non-http(s)
      // schemes anyway, and a local check gives an instant, clearer message.
      if (!isValidUrl(u)) { setError('Enter a full URL starting with http:// or https://'); return }
      if (!selectedPreview) { setError('Please preview the URL first to verify content extraction.'); return }
    }

    setSaving(true)
    try {
      let resolvedKbId = kbId || ''
      let kb: KB | null = null

      if (isNew) {
        const autoName = kbName.trim()
          || title.trim()
          || (file ? file.name.replace(/\.[^.]+$/, '') : '')
          || (tab === 'qna' ? (qnas[0]?.question || '').slice(0, 40) : '')
          || (tab === 'url' ? (() => { try { return new URL(url.trim()).hostname } catch { return '' } })() : '')
          || 'Knowledge Base'
        const newKb = await apiClient.createKB({ name: autoName, default_topic: topic || undefined })
        kb = newKb
        resolvedKbId = newKb.id
      }

      const formattedLabel = docLabels.join(', ') || undefined

      if (tab === 'doc' && file) {
        // Ingestion is asynchronous now, so there's no doc_id yet. The upload
        // carries the KB id and the background job creates the item once the
        // document is actually indexed; until then it shows as "processing" in
        // the listing, driven by the ingestion job.
        await apiClient.uploadDoc(
          docPreview ? null : file, undefined, docType, kbName || title || file.name,
          description || undefined, expiryDate || undefined, resolvedKbId, title || file.name,
          topic || undefined, formattedLabel || undefined, docPreview?.preview_token
        )
      } else if (tab === 'url') {
        // Returns 202 + a job id, same as file upload: only the fetch is
        // synchronous, parse/embed run in the background. The Documents tab
        // already polls ingestion jobs, so progress surfaces there on its own.
        // resolvedKbId is what makes the scraped page reachable by agents.
        // Passing the preview token indexes the exact bytes the user just
        // reviewed instead of re-fetching a page that may have changed.
        await apiClient.scrapeUrl(
          url.trim(), title.trim() || selectedPreview?.title || undefined, undefined, docType, kbName || title || '', description || undefined, resolvedKbId,
          selectedPreview?.preview_token, topic || undefined, formattedLabel || undefined, selectedPreviewMode,
        )
      } else if (tab === 'text') {
        await apiClient.addKBItem(resolvedKbId, { item_type: 'text', title: title || undefined, content: content.trim(), description: description || undefined, topic: topic || undefined, doc_label: formattedLabel })
      } else if (tab === 'qna') {
        const validQnas = qnas.filter(q => q.question.trim() && q.answer.trim())
        for (const item of validQnas) {
          await apiClient.addKBItem(resolvedKbId, {
            item_type: 'qna',
            question: item.question.trim(),
            content: item.answer.trim(),
            title: title.trim() || undefined,
            description: description || undefined,
            topic: topic || undefined,
            doc_label: formattedLabel
          })
        }
      }

      onDone(kb || { id: resolvedKbId, name: '', description: '', active: true, item_count: 1 })
    } catch (e: any) {
      // Surface the server's reason when it gave one -- URL ingestion fails in
      // specific, actionable ways (404, timeout, no extractable text) that a
      // generic message would hide.
      setError(e?.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full h-full max-w-[96%] lg:max-w-7xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
              📚
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{isNew ? 'New Knowledge Base' : 'Add Knowledge Item'}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Upload documents, fetch URLs, or paste text.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-6 shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setError('') }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0">
          {isNew && (
            <div className="mb-6">
              <Input label="Knowledge Base Name" value={kbName} onChange={e => setKbName(e.target.value)}
                placeholder="Knowledge base name (optional — auto-generated if blank)" />
            </div>
          )}

          {tab === 'doc' && (
            <div className="space-y-6">
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.docx" className="hidden"
                onChange={e => {
                  const selectedFile = e.target.files?.[0] || null
                  setFile(selectedFile)
                  if (selectedFile) {
                    handleDocPreview(selectedFile)
                  }
                }} />
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 rounded-2xl p-10 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-gray-800/30 group">
                {file
                  ? <div className="flex flex-col items-center justify-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                      <FileText className="w-8 h-8 opacity-80" />
                      {file.name}
                    </div>
                  : <>
                      <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-3 group-hover:text-indigo-500 transition-colors" />
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Click to select file</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF · TXT · MD · DOCX</p>
                    </>
                }
              </div>

              {/* Document Preview Box Area */}
              {docPreviewing && (
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/40 dark:from-indigo-950/20 dark:via-gray-900/60 dark:to-violet-950/20 shadow-xs flex items-center gap-2.5">
                  <Loader2 className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                  <span className="text-xs font-bold text-gray-850 dark:text-gray-200 animate-pulse">
                    Extracting document text preview...
                  </span>
                </div>
              )}

              {docPreviewError && (
                <div className="p-5 rounded-2xl border-2 border-red-500/20 bg-red-500/5 dark:bg-red-500/5 shadow-xs flex items-start gap-3.5">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-900 dark:text-red-100">Failed to generate preview</h4>
                    <p className="text-xs text-red-700 dark:text-red-400 mt-1.5 leading-relaxed font-semibold">
                      {docPreviewError}
                    </p>
                  </div>
                </div>
              )}

              {docPreview && (
                <div className="relative rounded-2xl border-2 border-indigo-500/30 dark:border-indigo-500/20 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.05] overflow-hidden shadow-[0_0_22px_rgba(99,102,241,0.08)] dark:shadow-[0_0_22px_rgba(99,102,241,0.05)] transition-all">
                  {/* Floating stats badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-150 dark:border-indigo-900/60 bg-white/90 dark:bg-gray-900/90 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 shadow-2xs">
                    <span>{docPreview.page_count} page{docPreview.page_count === 1 ? '' : 's'}</span>
                    <span className="text-indigo-250 dark:text-indigo-850">•</span>
                    <span>{docPreview.char_count.toLocaleString()} chars</span>
                    <span className="text-indigo-250 dark:text-indigo-850">•</span>
                    <span>{(docPreview.size_bytes / 1024).toFixed(0)} KB</span>
                  </div>

                  <pre
                    onScroll={e => {
                      const target = e.currentTarget
                      if (target.scrollHeight - target.scrollTop <= target.clientHeight + 80) {
                        setDocVisibleChars(prev => Math.min(prev + 15000, docPreview.extract.length))
                      }
                    }}
                    className="p-5 pr-44 text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono max-h-[550px] overflow-y-auto w-full relative"
                  >
                    {docPreview.extract.slice(0, docVisibleChars) || '(no text extracted)'}
                    {docVisibleChars < docPreview.extract.length && (
                      <span className="text-indigo-500 font-extrabold block text-center py-4 animate-pulse select-none">
                        {'\n\n[Scroll down to load more content...]'}
                      </span>
                    )}
                  </pre>
                </div>
              )}

              {/* ETA notice for PDF or large document ingestion */}
              {docPreview && (docPreview.content_type.includes('pdf') || docPreview.char_count > 15000) && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-150 dark:border-amber-950/60 bg-amber-500/[0.03] dark:bg-amber-500/[0.05] shadow-2xs">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-650 dark:text-gray-400 leading-relaxed font-semibold">
                    <span className="font-bold text-amber-700 dark:text-amber-400">⚡ Ingestion runs in the background (ETA: ~2-3 mins)</span>
                    <br />
                    Since this is a PDF or a large document, layout parsing and indexing runs as a background task. 
                    You can confirm the upload and continue working; we'll process it and notify you once it's fully complete.
                  </div>
                </div>
              )}

              <Input label="Document Name (optional)" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Custom display name" />
              <Select label="Document Type" value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="general">General</option>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="manual">Manual</option>
                <option value="product">Product</option>
              </Select>
              <Input label="Expiry Date (optional)" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-6">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input label="Website URL" type="url" value={url}
                    onChange={e => {
                      setUrl(e.target.value)
                      currentUrlRef.current = e.target.value.trim()
                      setQuickPreview(null)
                      setDeepPreview(null)
                      setSelectedPreviewMode('quick')
                      setPreviewError('')
                      setDeepPreviewError('')
                    }}
                    placeholder="https://example.com/help/faq" autoFocus />
                </div>
                <button type="button" onClick={handlePreview} disabled={previewing || !url.trim()}
                  className="flex items-center gap-2 px-6 py-3 h-[46px] text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap transition-colors shadow-xs">
                  {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {previewing ? 'Fetching…' : 'Preview'}
                </button>
              </div>

              {/* URL Preview Box Area (styled, bold, violet/indigo theme) */}
              {previewing && (
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/40 dark:from-indigo-950/20 dark:via-gray-900/60 dark:to-violet-950/20 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                      <span className="text-xs font-bold text-gray-850 dark:text-gray-255">
                        Fetching Web Page Preview
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {previewProgress}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${previewProgress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1.5 truncate max-w-[70%] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse flex-shrink-0" />
                      {previewStage}
                    </span>
                    <span className="font-mono text-[10px] truncate max-w-[28%] text-gray-400">
                      {url.trim().replace(/^https?:\/\//, '').slice(0, 28)}
                    </span>
                  </div>
                </div>
              )}

              {quickPreview && (
                <div className="flex flex-wrap items-center gap-2">
                  {deepPreview && (
                    <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 p-1" aria-label="Choose preview">
                      {(['quick', 'deep'] as PreviewMode[]).map(mode => (
                        <button key={mode} type="button" onClick={() => setSelectedPreviewMode(mode)}
                          aria-pressed={selectedPreviewMode === mode}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${selectedPreviewMode === mode ? 'bg-indigo-600 text-white shadow-2xs' : 'text-gray-600 dark:text-gray-300'}`}>
                          {mode} Preview
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={handleDeepPreview} disabled={deepPreviewing}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all">
                    {deepPreviewing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {deepPreviewing ? 'Generating Deep Preview…' : deepPreview ? 'Regenerate Deep Preview' : 'Generate Deep Preview'}
                  </button>
                  <span className="text-[11px] text-gray-500">Deep Preview can take a little longer and works better for dynamic pages.</span>
                </div>
              )}

              {deepPreviewError && (
                <div role="alert" className="p-4 rounded-2xl border-2 border-red-500/20 bg-red-500/5 text-xs font-semibold text-red-700 dark:text-red-400">
                  Deep Preview failed: {deepPreviewError}. Your Quick Preview is still available.
                </div>
              )}

              {selectedPreview && (
                <div className="relative rounded-2xl border-2 border-indigo-500/30 dark:border-indigo-500/20 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.05] overflow-hidden shadow-[0_0_22px_rgba(99,102,241,0.08)] dark:shadow-[0_0_22px_rgba(99,102,241,0.05)] transition-all">
                  {/* Floating stats badge (theme-adaptive: adapts to dashboard theme bg-white dark:bg-gray-900 border/text colors) */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-150 dark:border-indigo-900/60 bg-white/90 dark:bg-gray-900/90 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 shadow-2xs">
                    <span>{selectedPreview.page_count} page{selectedPreview.page_count === 1 ? '' : 's'}</span>
                    <span className="text-indigo-250 dark:text-indigo-850">•</span>
                    <span>{selectedPreview.char_count.toLocaleString()} chars</span>
                    <span className="text-indigo-250 dark:text-indigo-850">•</span>
                    <span>{(selectedPreview.size_bytes / 1024).toFixed(0)} KB</span>
                  </div>

                  <pre
                    onScroll={handleScroll}
                    className="p-5 pr-44 text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono max-h-[550px] overflow-y-auto w-full relative"
                  >
                    {selectedPreview.extract.slice(0, visibleChars) || '(no text extracted)'}
                    {visibleChars < selectedPreview.extract.length && (
                      <span className="text-indigo-500 font-extrabold block text-center py-4 animate-pulse select-none">
                        {'\n\n[Scroll down to load more content...]'}
                      </span>
                    )}
                  </pre>
                  
                  {selectedPreview.truncated && (
                    <div className="px-5 py-3 border-t border-indigo-100 dark:border-indigo-900/40 bg-indigo-500/[0.04] dark:bg-indigo-500/[0.06] text-xs font-extrabold text-indigo-650 dark:text-indigo-400 text-center w-full">
                      [Content truncated — the full page will be fully indexed during ingestion.]
                    </div>
                  )}
                </div>
              )}

              {/* ETA notice for PDF URL or large webpage ingestion */}
              {selectedPreview && (selectedPreview.content_type.includes('pdf') || selectedPreview.char_count > 15000) && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-150 dark:border-amber-950/60 bg-amber-500/[0.03] dark:bg-amber-500/[0.05] shadow-2xs">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-650 dark:text-gray-400 leading-relaxed font-semibold">
                    <span className="font-bold text-amber-700 dark:text-amber-400">⚡ Ingestion runs in the background (ETA: ~2-3 mins)</span>
                    <br />
                    Since this target page is large or a PDF document, layout indexing runs as a background task. 
                    You can confirm and continue working; we'll process it and notify you once it's fully complete.
                  </div>
                </div>
              )}

              {previewError && (
                <div className="p-5 rounded-2xl border-2 border-red-500/20 bg-red-500/5 dark:bg-red-500/5 shadow-xs flex items-start gap-3.5">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-900 dark:text-red-100">Failed to generate preview</h4>
                    <p className="text-xs text-red-700 dark:text-red-400 mt-1.5 leading-relaxed font-semibold">
                      {previewError}
                    </p>
                  </div>
                </div>
              )}

              {!quickPreview && !previewing && !previewError && (
                <div className="p-4.5 rounded-2xl border border-gray-200 dark:border-gray-800/80 bg-gray-50/30 dark:bg-gray-800/5 flex items-start gap-3">
                  <Globe className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-normal">
                    <strong>Preview first</strong> to verify what content the crawler will extract. Works best on static pages; JavaScript-rendered or protected pages may yield empty content.
                  </p>
                </div>
              )}

              <Input
                label="Page Title (optional)"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={selectedPreview?.title || "e.g., Return Policy & Refund FAQ"}
              />

              <Select label="Document Type" value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="general">General</option>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="manual">Manual</option>
                <option value="product">Product</option>
              </Select>
            </div>
          )}

          {tab === 'text' && (
            <div className="space-y-6">
              <Input label="Title (optional)" value={title} onChange={e => setTitle(e.target.value)} />
              <Textarea label="Content" value={content} onChange={e => setContent(e.target.value)}
                placeholder="Paste plain text or Markdown…" rows={12}
                className="font-mono text-sm leading-relaxed"
                hint={`${content.length} chars · Markdown supported`} />
            </div>
          )}

          {tab === 'qna' && (
            <div className="space-y-6">
              {/* Optional tip banner for switching to bulk import */}
              {kbId && onSwitchToBulk && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-indigo-150 dark:border-indigo-950/60 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.05] shadow-2xs">
                  <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-650 dark:text-gray-400 leading-relaxed font-semibold">
                    <span className="font-bold text-indigo-750 dark:text-indigo-400">💡 Tip: Importing many Q&As?</span>{' '}
                    You can switch to the{' '}
                    <button
                      type="button"
                      onClick={onSwitchToBulk}
                      className="text-indigo-650 dark:text-indigo-400 underline font-extrabold hover:text-indigo-850 transition-colors"
                    >
                      Bulk Q&A Import
                    </button>{' '}
                    tool to paste copy-pasted questions and answers in raw text format.
                  </div>
                </div>
              )}

              <Input
                label="Title (optional)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Return & Refund FAQs"
              />

              {/* Dynamic Q&A list */}
              <div className="space-y-6 max-h-[450px] overflow-y-auto pr-2 -mr-2">
                {qnas.map((qna, index) => (
                  <div
                    key={index}
                    className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/20 dark:bg-gray-800/5 shadow-2xs space-y-4 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Q&A Pair #{index + 1}
                      </span>
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setQnas(qnas.filter((_, i) => i !== index))
                          }}
                          className="text-xs font-bold text-red-500 hover:text-red-750 flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-5">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Question *</label>
                        <textarea
                          value={qna.question}
                          onChange={e => {
                            const newQnas = [...qnas]
                            newQnas[index].question = e.target.value
                            setQnas(newQnas)
                          }}
                          placeholder="e.g. What is the annual interest rate?"
                          className="w-full px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-850 dark:text-gray-150 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed h-[42px] min-h-[42px] resize-none"
                          autoFocus={index === qnas.length - 1}
                        />
                      </div>
                      <div className="md:col-span-7">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Answer *</label>
                        <textarea
                          value={qna.answer}
                          onChange={e => {
                            const newQnas = [...qnas]
                            newQnas[index].answer = e.target.value
                            setQnas(newQnas)
                          }}
                          placeholder="Type or paste the answer..."
                          className="w-full px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-850 dark:text-gray-150 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed h-[42px] min-h-[42px] resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add another button */}
              <button
                type="button"
                onClick={() => setQnas([...qnas, { question: '', answer: '' }])}
                className="flex items-center justify-center gap-2 w-full py-3 text-xs font-extrabold rounded-xl border border-dashed border-indigo-200 dark:border-indigo-800/80 text-indigo-600 dark:text-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/10 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                Add Another Q&A Pair
              </button>
            </div>
          )}

          {/* Common Chunk Metadata */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-6 bg-gray-50/30 dark:bg-gray-800/10 -mx-6 px-6 pb-6 rounded-b-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Common Chunk Metadata (Optional)
              </h3>
              <button
                type="button"
                onClick={handleGenerateMeta}
                disabled={generatingMeta || (!file && !url.trim() && !content.trim() && !title.trim() && !question.trim())}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200 dark:border-indigo-800/50 disabled:opacity-50 transition-colors shadow-2xs"
                title="Generate Description and Topic Tag using AI"
              >
                {generatingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                )}
                <span>{generatingMeta ? 'Suggesting…' : '✨ Auto-suggest'}</span>
              </button>
            </div>

            <Input
              label="Topic / Category Tag"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. SBI Credit Card, Refund Policy"
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Doc Labels (Citation Tags)</label>
              <TagInput
                tags={docLabels}
                onChange={setDocLabels}
                placeholder="Add Citation Tags (press Enter or comma…)"
              />
            </div>

            <Textarea
              label="Document Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Summary applied as context to all chunks"
              rows={3}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/80 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || (tab === 'url' && !selectedPreview)}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-all shadow-xs">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {isNew ? 'Creating…' : 'Adding…'}</>
              : isNew ? <><Plus className="w-4 h-4" /> Create</> : <><Plus className="w-4 h-4" /> Add</>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Bulk Q&A Import Modal ─────────────────────────────────────────────────────

function BulkQnaModal({ kbId, onClose, onDone }: { kbId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText]       = useState('')
  const [description, setDescription] = useState('')
  const [topic, setTopic]             = useState('')
  const [generatingMeta, setGeneratingMeta] = useState(false)
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

  const handleGenerateMeta = async () => {
    setError('')
    setGeneratingMeta(true)
    try {
      const res = await apiClient.suggestDocMetadata({
        title: 'Bulk Q&A Import',
        content: text.trim().slice(0, 1500),
      })
      if (res.description) setDescription(res.description)
      if (res.topic) setTopic(res.topic)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not generate metadata suggestions.')
    } finally {
      setGeneratingMeta(false)
    }
  }

  const handleImport = async () => {
    setSaving(true)
    try {
      for (const pair of preview) {
        await apiClient.addKBItem(kbId, {
          item_type: 'qna',
          question: pair.q,
          content: pair.a,
          description: description || undefined,
          topic: topic || undefined,
        })
      }
      onDone()
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full h-full max-w-4xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
              📥
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Bulk Import Q&A</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">One pair per block, separated by a blank line.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0">
          {preview.length === 0 ? (
            <div className="space-y-6">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700 px-5 py-4 text-xs text-gray-500 dark:text-gray-400 font-mono leading-relaxed shadow-inner">
                Q: What is your return policy?{'\n'}A: We accept returns within 30 days.{'\n\n'}Q: How do I track my order?{'\n'}A: Use the tracking link in your confirmation email.
              </div>
              <Textarea
                value={text}
                onChange={e => { setText(e.target.value); setError('') }}
                placeholder={'Q: Your question here\nA: Your answer here\n\nQ: Another question\nA: Another answer'}
                rows={12}
                className="font-mono text-sm leading-relaxed"
                autoFocus
              />
            </div>
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

          {/* Common Chunk Metadata */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-6 bg-gray-50/30 dark:bg-gray-800/10 -mx-6 px-6 pb-6 rounded-b-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Common Chunk Metadata (Optional)
              </h3>
              <button
                type="button"
                onClick={handleGenerateMeta}
                disabled={generatingMeta || !text.trim()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200 dark:border-indigo-800/50 disabled:opacity-50 transition-colors shadow-2xs"
                title="Generate Description and Topic Tag using AI"
              >
                {generatingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                )}
                <span>{generatingMeta ? 'Suggesting…' : '✨ Auto-suggest'}</span>
              </button>
            </div>

            <Input
              label="Topic / Category Tag"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. SBI Credit Card, Refund Policy"
            />

            <Textarea
              label="Document Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Summary applied as context to all chunks"
              rows={3}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-600 dark:text-red-400 whitespace-pre-line">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/80 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          {preview.length === 0
            ? <button onClick={handlePreview} disabled={!text.trim()}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 transition-all shadow-xs">
                <Eye className="w-4 h-4" /> Preview
              </button>
            : <>
                <button onClick={() => setPreview([])} className="px-5 py-2.5 text-sm font-semibold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">Back</button>
                <button onClick={handleImport} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-all shadow-xs">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Check className="w-4 h-4" /> Import {preview.length} pairs</>}
                </button>
              </>
          }
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Edit KB Item Modal ────────────────────────────────────────────────────────

function EditKBItemModal({
  item,
  kbId,
  knownTags = [],
  onClose,
  onDone,
}: {
  item: KBItem
  kbId: string
  knownTags?: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle]             = useState(item.title || '')
  const [description, setDescription] = useState(item.description || '')
  const [topic, setTopic]             = useState(item.topic || '')
  const [docLabels, setDocLabels]     = useState<string[]>(
    (item.doc_label || '').split(',').map(t => t.trim()).filter(Boolean)
  )
  const [question, setQuestion]       = useState(item.question || '')
  const [content, setContent]         = useState(item.content || '')
  const [saving, setSaving]           = useState(false)
  const [generatingMeta, setGeneratingMeta] = useState(false)
  const [error, setError]             = useState('')

  const handleGenerateMeta = async () => {
    setError('')
    setGeneratingMeta(true)
    try {
      const payload: { doc_id?: string; item_id?: string; filename?: string; title?: string; url?: string; content?: string } = {
        item_id: item.id,
        doc_id: item.id,
      }
      if (item.item_type === 'doc' && (item.title?.includes('.') || title.includes('.'))) {
        payload.filename = title || item.title || undefined
      }
      if (title.trim() || item.title) payload.title = title.trim() || item.title || undefined
      if (item.item_type === 'url') payload.url = item.content

      const snippet = content.trim() || question.trim() || item.content || description.trim() || title.trim() || item.title
      if (snippet) payload.content = snippet

      const res = await apiClient.suggestDocMetadata(payload)
      if (res.description) setDescription(res.description)
      if (res.topic) setTopic(res.topic)
      if (res.tags && res.tags.length > 0) setDocLabels(res.tags)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not generate metadata suggestions.')
    } finally {
      setGeneratingMeta(false)
    }
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      await apiClient.updateKBItem(kbId, item.id, {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        topic: topic.trim() || undefined,
        doc_label: docLabels.join(', ') || undefined,
        question: item.item_type === 'qna' ? question.trim() : undefined,
        content: (item.item_type === 'text' || item.item_type === 'qna') ? content.trim() : undefined,
      })
      onDone()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to update item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full h-full max-w-4xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
              📝
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">View & Edit Item Details</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                Type: {item.item_type.toUpperCase()} · ID: {item.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0">
          {/* Title */}
          <Input
            label="Title / Display Name"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
          />

          {/* Item Specific Content Editors */}
          {item.item_type === 'text' && (
            <Textarea
              label="Content Body"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              className="font-mono text-sm leading-relaxed"
            />
          )}

          {item.item_type === 'qna' && (
            <div className="space-y-6">
              <Textarea
                label="Question"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                rows={2}
              />
              <Textarea
                label="Answer"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={6}
              />
            </div>
          )}

          {/* Common Chunk Metadata */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-6 bg-gray-50/30 dark:bg-gray-800/10 -mx-6 px-6 pb-6 rounded-b-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Chunk Metadata (Topic & Description)
              </h3>
              <button
                type="button"
                onClick={handleGenerateMeta}
                disabled={generatingMeta}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200 dark:border-indigo-800/50 disabled:opacity-50 transition-colors shadow-2xs"
                title="Generate Description and Topic Tag using AI"
              >
                {generatingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                )}
                <span>{generatingMeta ? 'Suggesting…' : '✨ Auto-suggest'}</span>
              </button>
            </div>

            <Input
              label="Topic / Category Tag"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Topic Tag (e.g. SBI Credit Card)"
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Doc Labels (Citation Tags)</label>
              <TagInput
                tags={docLabels}
                onChange={setDocLabels}
                knownTags={knownTags}
                placeholder="Add Citation Tags (press Enter or comma…)"
              />
            </div>

            <Textarea
              label="Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Document Description (summary applied as context to all chunks)"
              rows={3}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/80 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 transition-all shadow-xs"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Inline editable Q&A item ──────────────────────────────────────────────────

function QnaItem({ item, kbId, onDelete, onEdit }: { item: KBItem; kbId: string; onDelete: () => void; onEdit?: () => void }) {
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
        <label className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">A:</label>
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
          {saved  && <><Check className="w-3 h-3 text-indigo-500" /><span className="text-indigo-600">Saved</span></>}
          {dirty && !saving && !saved && <span className="text-indigo-500">Unsaved</span>}
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View & Edit Details">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── KB Detail view (tabbed) ───────────────────────────────────────────────────

type DetailTab = 'docs' | 'url' | 'text' | 'qna' | 'facts'

function KBDetail({ kb, onBack }: { kb: KB; onBack: () => void }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab]       = useState<DetailTab>('docs')
  const [addOpen, setAddOpen]           = useState(false)
  const [bulkOpen, setBulkOpen]         = useState(false)
  const [agentModal, setAgentModal]     = useState(false)
  const [editingItem, setEditingItem]   = useState<KBItem | null>(null)
  const [viewChunks, setViewChunks]     = useState<{ docId: string; name: string } | null>(null)
  const [extractingDoc, setExtractingDoc] = useState<{ docId: string; name: string } | null>(null)
  const [jobError, setJobError]         = useState('')

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
  // Split by source so a URL scrape reports progress under URLs and a file
  // upload under Documents — a job showing on the tab you aren't looking at
  // reads as "nothing happened", and one showing on both reads as two uploads.
  const kbJobs   = (jobsData?.jobs ?? []).filter(j => j.kb_id === kb.id && j.status !== 'done')
  const fileJobs = kbJobs.filter(j => j.source !== 'url')
  const urlJobs  = kbJobs.filter(j => j.source === 'url')

  // Pull in the real document as soon as its job finishes.
  const doneCount = (jobsData?.jobs ?? []).filter(j => j.kb_id === kb.id && j.status === 'done').length
  useEffect(() => {
    if (doneCount > 0) queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] })
  }, [doneCount, kb.id, queryClient])

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => apiClient.deleteKBItem(kb.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] }),
  })

  const dismissJob = useMutation({
    mutationFn: (jobId: string) => apiClient.dismissIngestionJob(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingestion-jobs', kb.id] }),
  })

  const retryJob = useMutation({
    mutationFn: (jobId: string) => apiClient.retryIngestionJob(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingestion-jobs', kb.id] }),
    // A job without a stored payload (uploaded before this feature shipped) can't
    // be resumed — tell the user rather than letting the click do nothing.
    onError: (e: any) => setJobError(e?.response?.data?.detail || 'Could not retry the upload.'),
  })

  const setTopic = useMutation({
    mutationFn: ({ itemId, topic }: { itemId: string; topic: string }) =>
      apiClient.updateKBItem(kb.id, itemId, { topic }),
    // The server also re-stamps the document's chunks and drops the agent
    // cache, so the new scoping is live on the next message.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] }),
  })

  // Topics already in use, offered for reuse so a shared document gets tagged
  // with the exact slug an agent is already scoped to rather than a near-miss.
  const knownTopics = Array.from(
    new Set((items ?? []).map(i => i.topic).filter((t): t is string => !!t)),
  ).sort()

  const knownTags = Array.from(
    new Set(
      (items ?? []).flatMap(i => [
        ...(i.doc_label ? i.doc_label.split(',').map(t => t.trim()) : []),
        i.topic || ''
      ]).filter(Boolean)
    )
  ).sort()

  // How many agents actually read each topic — shown on the row because an
  // owner tagging a shared document wants to see that both agents pick it up,
  // and "no agent reads this" is the failure worth catching early.
  const { data: agents } = useQuery<{ slug: string; topics?: string[]; is_builtin?: boolean }[]>({
    queryKey: ['agents-topics'],
    queryFn: () => apiClient.listOrgAgents(),
  })
  const readersOf = (topic?: string | null) => {
    if (!topic || !agents) return undefined
    // An agent with no topics reads its whole knowledge base, so it reads this.
    return agents.filter(a => !a.is_builtin && (!a.topics?.length || a.topics.includes(topic))).length
  }

  const { data: factList } = useQuery<{ verified: boolean }[]>({
    queryKey: ['kb-facts', kb.id],
    queryFn: () => apiClient.listFacts(kb.id),
  })
  const factCount = (factList || []).length

  const docs  = items?.filter(i => i.item_type === 'doc')  || []
  const urls  = items?.filter(i => i.item_type === 'url')  || []
  const texts = items?.filter(i => i.item_type === 'text') || []
  const qnas  = items?.filter(i => i.item_type === 'qna')  || []

  const tabs: { id: DetailTab; label: string; count: number }[] = [
    { id: 'docs', label: 'Documents', count: docs.length },
    { id: 'url',  label: 'URLs',      count: urls.length },
    { id: 'text', label: 'Text',      count: texts.length },
    { id: 'qna',  label: 'Q & A',     count: qnas.length },
    // Facts sit last: they are derived from the documents above, so they only
    // make sense once something has been uploaded.
    { id: 'facts', label: 'Facts',    count: factCount },
  ]

  // Which "Add" form the toolbar button opens for each tab. Facts maps to 'doc'
  // because facts are not uploaded — they are extracted from a document, so the
  // useful action from an empty Facts tab is to add one.
  const tabToItemTab: Record<DetailTab, ItemTab> = {
    docs: 'doc', url: 'url', text: 'text', qna: 'qna', facts: 'doc',
  }

  return (
    <motion.div
      key="detail"
      layoutId={kb.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full w-9 h-9 !px-0">
          <ChevronLeft className="w-5 h-5" />
        </Button>
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
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              <List className="w-3.5 h-3.5" /> Bulk Import
            </Button>
          )}
          <Button variant="secondary" onClick={() => setAgentModal(true)}>
            <Plus className="w-3.5 h-3.5" /> Create Agent
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            {activeTab === 'docs'
              ? <><Upload className="w-4 h-4" /> Upload</>
              : activeTab === 'url'
                ? <><Globe className="w-4 h-4" /> Add URL</>
                : <><Plus className="w-4 h-4" /> Add</>}
          </Button>
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

      {jobError && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg">
          <span>{jobError}</span>
          <button onClick={() => setJobError('')} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tab content */}
      {isLoading && (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      )}

      {/* Docs tab */}
      {!isLoading && activeTab === 'docs' && (
        <>
          {fileJobs.length > 0 && (
            <div className="space-y-2 mb-2">
              {fileJobs.map(j => (
                <IngestionJobRow key={j.id} job={j}
                  onRetry={() => retryJob.mutate(j.id)}
                  retrying={retryJob.isPending && retryJob.variables === j.id}
                  onDismiss={() => dismissJob.mutate(j.id)} />
              ))}
            </div>
          )}
          {docs.length === 0 && fileJobs.length === 0
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
                        {item.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                        {item.doc_label && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {item.doc_label.split(',').map(t => t.trim()).filter(Boolean).map((t, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-full shadow-2xs">
                                <Tag className="w-2.5 h-2.5 text-indigo-500 opacity-70" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <TopicPicker
                            value={item.topic}
                            known={knownTopics}
                            agentCount={readersOf(item.topic)}
                            onSave={topic => setTopic.mutateAsync({ itemId: item.id, topic })}
                          />
                          {item.context_enriched && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-md">
                              <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                              Enriched {item.ai_cost_usd ? `· $${item.ai_cost_usd.toFixed(4)}` : ''}
                            </span>
                          )}
                          {item.created_at && <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>}
                        </div>

                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingItem(item)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View & Edit Details">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {item.doc_id && (
                          <button onClick={() => setViewChunks({ docId: item.doc_id!, name: item.title || item.doc_id! })}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View chunks">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.doc_id && (
                          <button onClick={() => setExtractingDoc({ docId: item.doc_id!, name: item.title || item.doc_id! })}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors" title="Extract Facts (V2)">
                            <Sparkles className="w-3.5 h-3.5" />
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

      {/* URLs tab */}
      {!isLoading && activeTab === 'url' && (
        <>
          {urlJobs.length > 0 && (
            <div className="space-y-2 mb-2">
              {urlJobs.map(j => (
                <IngestionJobRow key={j.id} job={j}
                  onRetry={() => retryJob.mutate(j.id)}
                  retrying={retryJob.isPending && retryJob.variables === j.id}
                  onDismiss={() => dismissJob.mutate(j.id)} />
              ))}
            </div>
          )}
          {urls.length === 0 && urlJobs.length === 0
            ? <EmptyState label="No web pages yet" cta="Add URL" onCta={() => setAddOpen(true)} />
            : <div className="space-y-2">
                {urls.map(item => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Globe className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title || item.doc_id}</p>
                        {/* content holds the source URL for url items — link
                            back so the original page is one click away. */}
                        {item.content && (
                          <a href={item.content} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-indigo-500 hover:text-indigo-400 hover:underline truncate block">
                            {item.content}
                          </a>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                        {item.doc_label && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {item.doc_label.split(',').map(t => t.trim()).filter(Boolean).map((t, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-full shadow-2xs">
                                <Tag className="w-2.5 h-2.5 text-indigo-500 opacity-70" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <TopicPicker
                            value={item.topic}
                            known={knownTopics}
                            agentCount={readersOf(item.topic)}
                            onSave={topic => setTopic.mutateAsync({ itemId: item.id, topic })}
                          />
                          {item.context_enriched && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-md">
                              <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                              Enriched {item.ai_cost_usd ? `· $${item.ai_cost_usd.toFixed(4)}` : ''}
                            </span>
                          )}
                          {item.created_at && <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>}
                        </div>

                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingItem(item)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View & Edit Details">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {item.doc_id && (
                          <button onClick={() => setViewChunks({ docId: item.doc_id!, name: item.title || item.doc_id! })}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View chunks">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.doc_id && (
                          <button onClick={() => setExtractingDoc({ docId: item.doc_id!, name: item.title || item.doc_id! })}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors" title="Extract Facts (V2)">
                            <Sparkles className="w-3.5 h-3.5" />
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
                      <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Type className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {item.title && <p className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">{item.title}</p>}
                        {item.description && (
                          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1 leading-relaxed">{item.description}</p>
                        )}
                        {item.doc_label && (
                          <div className="flex flex-wrap items-center gap-1 mb-1.5">
                            {item.doc_label.split(',').map(t => t.trim()).filter(Boolean).map((t, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-full shadow-2xs">
                                <Tag className="w-2.5 h-2.5 text-indigo-500 opacity-70" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">{item.content}</p>
                        {item.created_at && <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setEditingItem(item)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors" title="View & Edit Details">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
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

      {/* Q&A tab */}
      {!isLoading && activeTab === 'qna' && (
        <>
          {qnas.length === 0
            ? <EmptyState label="No Q&A pairs yet" cta="Add Q&A" onCta={() => setAddOpen(true)} />
            : <div className="space-y-3">
                {qnas.map(item => (
                  <QnaItem key={item.id} item={item} kbId={kb.id}
                    onEdit={() => setEditingItem(item)}
                    onDelete={() => deleteMutation.mutate(item.id)} />
                ))}
              </div>
          }
        </>
      )}

      {/* Facts tab — extracted from the documents and URLs above, then confirmed. */}
      {!isLoading && activeTab === 'facts' && (
        <FactsTab kbId={kb.id} docs={[...docs, ...urls]} topics={knownTopics} />
      )}

      {/* Modals */}
      {addOpen && (
        <KBModal
          kbId={kb.id}
          defaultTab={tabToItemTab[activeTab]}
          onClose={() => setAddOpen(false)}
          onSwitchToBulk={() => {
            setAddOpen(false)
            setBulkOpen(true)
          }}
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
          onClose={() => {
            setBulkOpen(false)
            setAddOpen(true)
          }}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] })
            setBulkOpen(false)
          }}
        />
      )}

      {editingItem && (
        <EditKBItemModal
          item={editingItem}
          kbId={kb.id}
          knownTags={knownTags}
          onClose={() => setEditingItem(null)}
          onDone={() => {
            setEditingItem(null)
            queryClient.invalidateQueries({ queryKey: ['kb-items', kb.id] })
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

      {extractingDoc && (
        <ExtractedFactsModal
          docId={extractingDoc.docId}
          docName={extractingDoc.name}
          kbId={kb.id}
          onClose={() => setExtractingDoc(null)}
        />
      )}
    </motion.div>
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
  // Adding a URL used to mean Open → Upload → URL tab: two clicks behind two
  // buttons that both read as something else ("Open", "Upload"). Surfaced on
  // the row so the action is visible where the KB is.
  const [addUrlKb, setAddUrlKb]         = useState<KB | null>(null)

  const { data: kbs, isLoading, isError, refetch } = useQuery<KB[]>({
    queryKey: ['knowledge-bases'],
    queryFn: () => apiClient.listKBs(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteKB(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] }),
  })

  return (
    <AnimatePresence mode="wait">
      {selectedKB ? (
        <KBDetail key="detail" kb={selectedKB} onBack={() => setSelectedKB(null)} />
      ) : (
    <motion.div
      key="list"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 space-y-4"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => refetch()} title="Refresh" className="p-2 w-auto px-2">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button
          variant="secondary"
          onClick={() => setAgentModalKb({ id: '', name: '', description: '', active: true, item_count: 0 })}
        >
          <Plus className="w-4 h-4" /> Create Agent
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> New Knowledge Base
        </Button>
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Knowledge Base
          </Button>
        </div>
      )}

      {/* Table */}
      {kbs && kbs.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_120px_210px] gap-4 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Items</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Actions</span>
          </div>

          {/* Rows */}
          {kbs.map((kb, i) => (
            <Card
              key={kb.id}
              layoutId={kb.id}
              interactive
              delayClass={`animate-stagger-${(i % 4) + 1}`}
              onClick={() => setSelectedKB(kb)}
              className="group grid grid-cols-[1fr_80px_120px_210px] gap-4 px-4 py-3 items-center cursor-pointer border-b-0 rounded-none first:rounded-t-lg last:rounded-b-lg border-b border-gray-200 dark:border-gray-700/60 last:border-0"
            >
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
                {/* Always visible, unlike the hover-only actions beside it:
                    hiding this until hover is what made URL ingestion
                    undiscoverable in the first place, and hover doesn't exist
                    on touch at all. */}
                <button
                  onClick={() => setAddUrlKb(kb)}
                  title="Add a web page to this knowledge base"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                  <Globe className="w-3.5 h-3.5" /> URL
                </button>
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
                <Button
                  size="sm"
                  onClick={() => setSelectedKB(kb)}
                >
                  Open
                </Button>
              </div>
            </Card>
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

      {/* Same modal the Upload button opens, just pre-selected to the URL tab
          and bound to this row's KB — no separate flow to keep in sync. */}
      {addUrlKb !== null && (
        <KBModal
          kbId={addUrlKb.id}
          defaultTab="url"
          onClose={() => setAddUrlKb(null)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
            setAddUrlKb(null)
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
    </motion.div>
      )}
    </AnimatePresence>
  )
}
