import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, FileText, AlertCircle, RefreshCw, X, CheckCircle2, Plus, Eye, Loader2, ChevronDown, ChevronUp, Bot } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { useAppStore } from '../store/useAppStore'
import { apiClient } from '../api/client'
import type { RagDoc } from '../types'
import { CreateAgentModal } from './Agents'

// ── Chunks Modal ──────────────────────────────────────────────────────────────

interface Chunk { chunk_index: number; page: number; section: string; text: string }

function ChunksModal({ docId, docName, onClose }: { docId: string; docName: string; onClose: () => void }) {
  const [chunks, setChunks]   = useState<Chunk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Chunks — {docName}</h3>
            {!loading && <p className="text-xs text-gray-500 mt-0.5">{chunks.length} chunks stored in vector DB</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading chunks…
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && chunks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No chunks found for this document.</p>
          )}
          {chunks.map((chunk, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 w-6 text-right flex-shrink-0">#{i + 1}</span>
                  <span className="text-xs text-gray-500">Page {chunk.page}</span>
                  {chunk.section && <span className="text-xs text-gray-400 truncate max-w-[200px]">· {chunk.section}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
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

const DOC_TYPES = ['policy', 'tech_support', 'manual', 'faq', 'catalog', 'general']

function DocTypeBadge({ docType }: { docType?: string }) {
  const variantMap: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
    policy: 'warning',
    tech_support: 'success',
    manual: 'default',
    faq: 'default',
    catalog: 'success',
    general: 'default',
  }
  return <Badge variant={variantMap[docType || 'general'] || 'default'}>{docType || 'general'}</Badge>
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

interface UploadedDoc { name: string; docType: string; docId: string }

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (doc: UploadedDoc) => void }) {
  const { orgSlug } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const effectiveClientId = orgSlug

  const [kbName, setKbName] = useState('')
  const [kbNameError, setKbNameError] = useState('')
  const [description, setDescription] = useState('')
  const [docType, setDocType] = useState('policy')
  const [expiryDate, setExpiryDate] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const validateKbName = (value: string) => {
    if (!value) return 'Required'
    if (/\s/.test(value)) return 'No spaces — use hyphens or underscores'
    if (!/^[a-z0-9_-]+$/.test(value)) return 'Only lowercase letters, numbers, - and _'
    return ''
  }

  const handleKbNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/\s/g, '-')
    setKbName(val)
    setKbNameError(validateKbName(val))
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...fileArray.filter(f => !existing.has(f.name))]
    })
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeSelectedFile = (name: string) =>
    setSelectedFiles(prev => prev.filter(f => f.name !== name))

  const handleUpload = async () => {
    const err = validateKbName(kbName)
    if (err) { setKbNameError(err); return }
    if (selectedFiles.length === 0) { setUploadError('Select at least one file.'); return }
    setUploadError(null)
    setUploadProgress(`Uploading ${selectedFiles.length} file(s)…`)
    try {
      const results = await Promise.all(selectedFiles.map(f =>
        apiClient.uploadDoc(f, effectiveClientId || undefined, docType, kbName, description || undefined, expiryDate || undefined)
      ))
      setUploadProgress(null)
      const first = results[0]
      onSuccess({
        name: selectedFiles[0].name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        docType,
        docId: first?.doc_id || first?.id || '',
      })
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
      setUploadProgress(null)
    }
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white'
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upload Documents</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">org: <span className="text-indigo-600 dark:text-indigo-400">@{effectiveClientId}</span></span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Row 1: KB Name + Doc Type */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>KB Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={kbName}
                onChange={handleKbNameChange}
                placeholder="product-docs"
                className={`${inputCls} ${kbNameError ? 'border-red-400' : ''}`}
              />
              {kbNameError
                ? <p className="text-xs text-red-500 mt-0.5">{kbNameError}</p>
                : <p className="text-xs text-gray-400 mt-0.5">No spaces · unique per org</p>
              }
            </div>
            <div>
              <label className={labelCls}>Doc Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} className={inputCls}>
                {DOC_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Description + Expiry */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What's in this knowledge base?"
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div>
              <label className={labelCls}>Expiry <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={inputCls}
              />
              <p className="text-xs text-gray-400 mt-0.5">{expiryDate ? `Expires ${expiryDate}` : 'No expiry'}</p>
            </div>
          </div>

          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.docx"
            className="hidden"
            onChange={e => handleFileSelect(e.target.files)}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl p-4 text-center cursor-pointer transition-colors bg-gray-50 dark:bg-gray-800/50"
          >
            <Upload className="w-5 h-5 text-gray-400 dark:text-gray-500 mx-auto mb-1" />
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Click to select files</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF, TXT, MD, DOCX</p>
          </div>

          {/* Selected files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1">
              {selectedFiles.map(f => (
                <div key={f.name} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                  <button onClick={() => removeSelectedFile(f.name)} className="ml-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {uploadError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600 dark:text-red-400">{uploadError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!!uploadProgress}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
          >
            {uploadProgress
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><Upload className="w-4 h-4" /> Upload{selectedFiles.length > 0 ? ` ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}` : ''}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function KnowledgeBase() {
  const { orgSlug } = useAppStore()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [viewingChunks, setViewingChunks] = useState<{ docId: string; docName: string } | null>(null)
  const [creatingAgentFor, setCreatingAgentFor] = useState<{ name: string; docType: string; docId: string } | null>(null)
  const effectiveClientId = orgSlug

  const { data: docs, isLoading, isError, refetch } = useQuery<RagDoc[]>({
    queryKey: ['admin-kb-docs', effectiveClientId],
    queryFn: async () => {
      const data = await apiClient.listDocs()
      return data.documents || data || []
    },
    retry: 1,
  })

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => apiClient.deleteDoc(docId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-kb-docs'] }),
  })

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Knowledge Docs</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Agents query these docs automatically · org-isolated · persist until deleted
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Docs
        </button>
      </div>

      {/* Docs list */}
      {isLoading && (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      )}

      {isError && (
        <Card className="p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Could not load documents.</p>
        </Card>
      )}

      {!isLoading && !isError && docs?.length === 0 && (
        <Card className="p-12 text-center">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">No documents yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Upload docs to power your agents</p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Docs
          </button>
        </Card>
      )}

      {docs && docs.length > 0 && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {docs.map(doc => (
              <Card key={doc.doc_id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.filename}</p>
                      <DocTypeBadge docType={doc.doc_type} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {doc.kb_name && <span className="font-medium text-gray-600 dark:text-gray-300">{doc.kb_name} · </span>}
                      {doc.pages > 0 && `${doc.pages}p · `}{doc.chunks > 0 && `${doc.chunks} chunks · `}
                      {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ''}
                      {doc.expires_at && ` · expires ${new Date(doc.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setCreatingAgentFor({
                      name: doc.filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
                      docType: doc.doc_type || 'general',
                      docId: doc.doc_id,
                    })}
                    className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-400 hover:text-purple-500 transition-colors"
                    title="Create agent for this doc"
                  >
                    <Bot className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewingChunks({ docId: doc.doc_id, docName: doc.filename })}
                    className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-500 transition-colors"
                    title="View chunks"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(doc.doc_id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Upload success toast */}
      {!isLoading && docs && docs.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => refetch()} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {modalOpen && (
        <UploadModal
          onClose={() => setModalOpen(false)}
          onSuccess={(doc) => {
            queryClient.invalidateQueries({ queryKey: ['admin-kb-docs'] })
            // First doc uploaded — guide user to create an agent for it
            if (!docs || docs.length === 0) {
              setCreatingAgentFor(doc)
            }
          }}
        />
      )}

      {/* Chunks Viewer Modal */}
      {viewingChunks && (
        <ChunksModal
          docId={viewingChunks.docId}
          docName={viewingChunks.docName}
          onClose={() => setViewingChunks(null)}
        />
      )}

      {/* Create Agent from doc shortcut */}
      {creatingAgentFor && (
        <CreateAgentModal
          prefill={{ name: creatingAgentFor.name, docType: creatingAgentFor.docType, docId: creatingAgentFor.docId }}
          onClose={() => setCreatingAgentFor(null)}
          onCreated={() => setCreatingAgentFor(null)}
        />
      )}
    </div>
  )
}
