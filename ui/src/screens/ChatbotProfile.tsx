import { useState, useEffect, useRef } from 'react'
import { Bot, Upload, Trash2, CheckCircle, Plus, Star } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { apiClient } from '../api/client'

interface Chatbot {
  id: string
  slug: string
  display_name: string
  logo_url: string | null
  show_logo: boolean
  is_default: boolean
}

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_SIZE_MB = 2

export function ChatbotProfile() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [selected, setSelected] = useState<Chatbot | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [quota, setQuota] = useState<{ count: number; limit: number; unlimited: boolean; can_create: boolean } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Multi-bot UI shows only when the space is allowed more than one chatbot.
  const isMulti = !!quota && (quota.unlimited || quota.limit > 1)

  const loadChatbots = () => {
    apiClient.getChatbots()
      .then((data: Chatbot[]) => {
        setChatbots(data)
        setSelected(prev => data.find(c => c.id === prev?.id) ?? data.find(c => c.is_default) ?? data[0] ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const refreshQuota = () => apiClient.getChatbotQuota().then(setQuota).catch(() => {})

  useEffect(() => { loadChatbots(); refreshQuota() }, [])

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true); setError('')
    try {
      const created = await apiClient.createChatbot({ slug: slugify(name), display_name: name })
      setNewName(''); setShowCreate(false)
      setSelected(created)
      loadChatbots(); refreshQuota()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not create chatbot.')
    } finally {
      setCreating(false)
    }
  }

  const handleSetDefault = async (bot: Chatbot) => {
    try { await apiClient.setDefaultChatbot(bot.slug); loadChatbots() }
    catch { setError('Could not set default.') }
  }

  const handleDelete = async (bot: Chatbot) => {
    if (bot.is_default) return
    if (!confirm(`Delete chatbot "${bot.display_name}"? This cannot be undone.`)) return
    try {
      await apiClient.deleteChatbot(bot.slug)
      if (selected?.id === bot.id) setSelected(null)
      loadChatbots(); refreshQuota()
    } catch { setError('Could not delete chatbot.') }
  }

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  const handleUpload = async (file: File) => {
    if (!selected) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_SIZE_MB}MB.`)
      return
    }
    setError('')
    setUploading(true)
    try {
      const updated = await apiClient.uploadChatbotLogo(selected.slug, file)
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Upload failed. Please try a different image.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!selected) return
    setUploading(true)
    try {
      const updated = await apiClient.deleteChatbotLogo(selected.slug)
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Could not remove the logo.')
    } finally {
      setUploading(false)
    }
  }

  const handleToggleShowLogo = async (val: boolean) => {
    if (!selected) return
    setSelected({ ...selected, show_logo: val })
    setSavingToggle(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { show_logo: val })
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Could not update visibility.')
    } finally {
      setSavingToggle(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">

      {saved && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-1.5 animate-fadeIn">
          <CheckCircle className="w-4 h-4" /> Saved
        </div>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Upload a logo for each chatbot. Customers see it in the chat header and in bot messages.
        If a chatbot has no logo, it falls back to your organization's logo, then to a default icon.
      </p>

      {/* Chatbot selector — single-bot spaces see just the list; multi-bot spaces
          also get create / set-default / delete controls. */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isMulti ? 'Chatbots' : 'Chatbot'}
          </h3>
          <div className="flex items-center gap-2">
            {quota && (
              <span className="text-xs text-gray-400">
                {quota.count}{quota.unlimited ? '' : ` / ${quota.limit}`} used
              </span>
            )}
            {isMulti && (
              <Button size="sm" variant="secondary" disabled={!quota?.can_create}
                onClick={() => setShowCreate(v => !v)}>
                <Plus className="w-3.5 h-3.5" /> New
              </Button>
            )}
          </div>
        </div>

        {isMulti && showCreate && (
          <div className="flex items-center gap-2 mb-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="New chatbot name"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
            />
            <Button size="sm" disabled={creating || !newName.trim()} onClick={handleCreate}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
        )}

        {loading && <p className="text-xs text-gray-400 italic">Loading chatbots…</p>}
        {!loading && chatbots.length === 0 && (
          <p className="text-xs text-gray-400 italic">No chatbots found.</p>
        )}

        {!loading && chatbots.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {chatbots.map(bot => (
              <div
                key={bot.id}
                className={`flex items-center gap-1 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  selected?.id === bot.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <button
                  onClick={() => setSelected(bot)}
                  className={`flex-1 min-w-0 text-left font-medium truncate ${
                    selected?.id === bot.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {bot.display_name}
                  {bot.is_default && <span className="ml-1.5 text-xs text-gray-400">(default)</span>}
                </button>
                {isMulti && !bot.is_default && (
                  <>
                    <button title="Set as default" onClick={() => handleSetDefault(bot)}
                      className="p-1 text-gray-400 hover:text-amber-500 flex-shrink-0">
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button title="Delete" onClick={() => handleDelete(bot)}
                      className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Logo editor */}
      {selected && (
        <Card className="p-5 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Logo — {selected.display_name}</h3>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-700 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-600">
              {selected.logo_url ? (
                <img src={selected.logo_url} alt={selected.display_name} className="w-full h-full object-cover" />
              ) : (
                <Bot className="w-7 h-7 text-gray-400" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              />
              <Button size="sm" variant="secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading…' : 'Upload'}
              </Button>
              {selected.logo_url && (
                <Button size="sm" variant="danger" disabled={uploading} onClick={handleRemove}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

          <p className="text-xs text-gray-400 dark:text-gray-500">
            PNG, JPG, WEBP, or SVG · max {MAX_SIZE_MB}MB
          </p>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Show logo on chat widget</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                When off, the default icon is always shown for this chatbot, even if a logo is uploaded.
              </p>
            </div>
            <Toggle checked={selected.show_logo} onChange={handleToggleShowLogo} disabled={savingToggle} />
          </div>
        </Card>
      )}
    </div>
  )
}
