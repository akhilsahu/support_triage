import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { yulloOnboardingApi } from '../../api/onboarding'
import { DraftSpace } from './YulloOnboarding'
import { Link as LinkIcon, FileText, Upload, Plus, Trash2, ArrowRight, ArrowLeft, X } from 'lucide-react'

export function TeachStep({ draft, token, onContinue, onSourceAdded, onSourcesChange, onBack }: { draft: DraftSpace, token: string, onContinue: (d: DraftSpace) => void, onSourceAdded?: () => void, onSourcesChange?: (s: any[]) => void, onBack: () => void }) {
  const [sources, setSources] = useState<any[]>(draft.sources || [])
  
  const [expandedAction, setExpandedAction] = useState<'link' | 'text' | 'upload' | null>(null)
  const [showOptions, setShowOptions] = useState(sources.length === 0)
  
  const [urlValue, setUrlValue] = useState('')
  const [textValue, setTextValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(false)

  const inferUrlType = (url: string) => {
    const l = url.toLowerCase()
    if (l.includes('instagram.com')) return 'instagram'
    if (l.includes('linkedin.com')) return 'linkedin'
    if (l.includes('youtube.com') || l.includes('youtu.be')) return 'youtube'
    return 'website'
  }

  const handleAddUrl = async () => {
    if (!urlValue) return
    setAdding(true)
    try {
      const type = inferUrlType(urlValue)
      const src = await yulloOnboardingApi.addSourceUrl(urlValue, type, draft.id, token)
      const newSources = [...sources, src]
      setSources(newSources)
      setUrlValue('')
      setExpandedAction(null)
      setShowOptions(false)
      onSourceAdded?.()
      onSourcesChange?.(newSources)
    } catch (e) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  const handleAddText = async () => {
    if (!textValue) return
    setAdding(true)
    try {
      const src = await yulloOnboardingApi.addSourceText(textValue, draft.id, token)
      const newSources = [...sources, src]
      setSources(newSources)
      setTextValue('')
      setExpandedAction(null)
      setShowOptions(false)
      onSourceAdded?.()
      onSourcesChange?.(newSources)
    } catch (e) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await yulloOnboardingApi.deleteSource(id, token)
      const newSources = sources.filter(s => s.id !== id)
      setSources(newSources)
      onSourcesChange?.(newSources)
      if (newSources.length === 0) {
        setShowOptions(true)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleContinue = async () => {
    setLoading(true)
    try {
      await yulloOnboardingApi.generatePreview(false, token)
      onContinue({ ...draft, sources, current_step: 'preview' })
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (expandedAction) {
      setExpandedAction(null)
    } else if (showOptions && sources.length > 0) {
      setShowOptions(false)
    } else {
      onBack()
    }
  }

  return (
    <div className="max-w-xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={handleBack}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Give it context
          </h1>
          <p className="text-gray-500 text-lg">
            Add any link, document, or paste text to train your Space.
          </p>
        </div>
      </div>

      <div className="mb-10 space-y-4">
        {/* Added Sources List */}
        {sources.length > 0 && (
          <div className="space-y-2 mb-6">
            {sources.map(s => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={s.id} 
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm group"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0 text-gray-400 border border-gray-100">
                    {s.source_type === 'text' ? <FileText className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {s.source_type === 'text' ? 'Text snippet' : s.content_ref}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">{s.source_type}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(s.id)}
                  className="p-2 text-gray-300 hover:text-gray-900 rounded-lg transition-colors"
                  title="Remove source"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Source Actions */}
        <AnimatePresence mode="wait">
          {!expandedAction && showOptions && (
            <motion.div
              key="options"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <button
                onClick={() => setExpandedAction('link')}
                className="w-full flex items-center gap-3 p-4 bg-white hover:bg-gray-50 border border-gray-100 rounded-2xl transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Add a link</div>
                  <div className="text-xs text-gray-500">Website, YouTube, Instagram, LinkedIn</div>
                </div>
              </button>

              <button
                onClick={() => setExpandedAction('upload')}
                className="w-full flex items-center gap-3 p-4 bg-white hover:bg-gray-50 border border-gray-100 rounded-2xl transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Upload something</div>
                  <div className="text-xs text-gray-500">PDF, TXT, DOCX</div>
                </div>
              </button>

              <button
                onClick={() => setExpandedAction('text')}
                className="w-full flex items-center gap-3 p-4 bg-white hover:bg-gray-50 border border-gray-100 rounded-2xl transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-[#FFFC00]/10 text-[#b3b100] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Paste text</div>
                  <div className="text-xs text-gray-500">Raw text, rules, or instructions</div>
                </div>
              </button>
              
              {sources.length > 0 && (
                <div className="pt-2 text-center">
                  <button
                    onClick={() => setShowOptions(false)}
                    className="text-sm text-gray-500 hover:text-gray-900 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {expandedAction === 'link' && (
            <motion.div
              key="link-input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-2">
                <div className="pl-3 text-gray-400">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={urlValue}
                  onChange={e => setUrlValue(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 py-3 bg-transparent focus:outline-none text-gray-900 placeholder:text-gray-400"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
                />
                <button 
                  onClick={() => setExpandedAction(null)}
                  className="text-gray-400 hover:text-gray-900 px-3 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddUrl}
                  disabled={!urlValue || adding}
                  className="bg-[var(--accent-solid)] text-[var(--accent-on-solid)] px-5 py-2.5 rounded-xl font-semibold hover:opacity-90 transition-colors disabled:opacity-50 flex flex-shrink-0 items-center gap-2 text-sm"
                >
                  {adding ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Add'}
                </button>
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-2 px-2">
                <span className="text-xs text-gray-500 font-medium py-1.5 pr-1">Suggestions:</span>
                <button 
                  onClick={() => setUrlValue('https://youtube.com/@username')}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
                >
                  YouTube
                </button>
                <button 
                  onClick={() => setUrlValue('https://linkedin.com/in/username')}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
                >
                  LinkedIn
                </button>
                <button 
                  onClick={() => setUrlValue('https://instagram.com/username')}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
                >
                  Instagram
                </button>
                <button 
                  onClick={() => setUrlValue('https://x.com/username')}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
                >
                  X (Twitter)
                </button>
              </div>
            </motion.div>
          )}

          {expandedAction === 'text' && (
            <motion.div
              key="text-input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white p-2 rounded-2xl border border-gray-200 shadow-sm"
            >
              <textarea
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                placeholder="Paste raw text here..."
                className="w-full p-4 bg-transparent focus:outline-none text-gray-900 placeholder:text-gray-400 h-32 resize-none leading-relaxed"
                autoFocus
              />
              <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100 mt-2 px-2 pb-1">
                <button 
                  onClick={() => setExpandedAction(null)}
                  className="text-gray-500 hover:text-gray-900 px-4 py-2 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddText}
                  disabled={!textValue || adding}
                  className="bg-[var(--accent-solid)] text-[var(--accent-on-solid)] px-5 py-2.5 rounded-xl font-semibold hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  {adding ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Add Text'}
                </button>
              </div>
            </motion.div>
          )}

          {expandedAction === 'upload' && (
            <motion.div
              key="upload-input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center"
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-900 mb-1">Click to upload or drag & drop</p>
              <p className="text-xs text-gray-500 mb-6">PDF, TXT, DOCX (Coming soon)</p>
              <button 
                onClick={() => setExpandedAction(null)}
                className="text-gray-500 hover:text-gray-900 text-sm font-medium"
              >
                Cancel
              </button>
            </motion.div>
          )}

          {/* Add Another Button */}
          {!showOptions && !expandedAction && sources.length > 0 && (
            <motion.div
              key="add-another"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <button
                onClick={() => setShowOptions(true)}
                className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 font-semibold text-sm transition-colors py-2 px-4 rounded-full hover:bg-gray-100"
              >
                <Plus className="w-4 h-4" /> Add another
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          onClick={handleContinue}
          disabled={loading}
          className="text-gray-400 hover:text-gray-900 font-semibold text-sm transition-colors px-4 py-2 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
        >
          Skip this step
        </button>
        
        <button
          onClick={handleContinue}
          disabled={loading || sources.length === 0}
          className="bg-[#FFFC00] hover:bg-[#E5E300] text-black px-8 py-3.5 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : null}
          See my Aura <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
