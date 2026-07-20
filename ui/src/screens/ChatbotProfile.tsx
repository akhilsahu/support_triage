import { useState, useEffect, useRef } from 'react'
import { Bot, Upload, Trash2, CheckCircle, Plus, Star, Copy, Check, Pencil, ChevronUp, ChevronDown } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'

interface Chatbot {
  id: string
  slug: string
  display_name: string
  description: string
  logo_url: string | null
  theme_color: string | null
  show_logo: boolean
  is_default: boolean
  active: boolean
  homepage_sections_enabled: boolean
  homepage_sections_override: string | null
  quick_topics: string | null
  trust_badges: string | null
}

const DEFAULT_THEME_COLOR = '#6366f1'

// Sections an admin can manually pick/order, mirrors app/renderengine/homepage_sections.py's
// ALLOWED_SECTIONS minus quick_topics/trust_badges -- those two have their own dedicated
// authoring card + force-include path below, so listing them here too would be a redundant,
// confusing second way to turn on the same content.
const SECTION_OPTIONS: { id: string; label: string }[] = [
  { id: 'hero', label: 'Hero (logo + greeting)' },
  { id: 'key_benefits', label: 'Key benefits' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'suggested_questions', label: 'Suggested questions' },
  { id: 'faq', label: 'FAQ' },
  { id: 'data_block', label: 'Data block (table / chart / card)' },
  { id: 'promo', label: 'Promo banner' },
]

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_SIZE_MB = 2

export function ChatbotProfile() {
  const currentChatbotId = useAppStore(s => s.currentChatbotId)
  const setCurrentChatbotId = useAppStore(s => s.setCurrentChatbotId)
  const spaceSlug = useAppStore(s => s.spaceSlug)
  const homepageSectionsPlatformEnabled = useAppStore(s => s.homepageSectionsPlatformEnabled)

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
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [colorDraft, setColorDraft] = useState(DEFAULT_THEME_COLOR)
  const [savingColor, setSavingColor] = useState(false)
  const [savingActive, setSavingActive] = useState(false)
  const [savingHomepageSections, setSavingHomepageSections] = useState(false)
  const [useAiSections, setUseAiSections] = useState(true)
  const [savingUseAiSections, setSavingUseAiSections] = useState(false)
  const [pickedSections, setPickedSections] = useState<string[]>([])
  const [promoText, setPromoText] = useState('')
  const [savingSectionOverride, setSavingSectionOverride] = useState(false)
  const [topicsDraft, setTopicsDraft] = useState<{ label: string; prompt: string }[]>([])
  const [savingTopics, setSavingTopics] = useState(false)
  const [badgesDraft, setBadgesDraft] = useState<string[]>([])
  const [savingBadges, setSavingBadges] = useState(false)
  const [statsDraft, setStatsDraft] = useState<{ value: string; label: string }[]>([])
  const [savingStats, setSavingStats] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Multi-bot UI shows only when the space is allowed more than one chatbot.
  const isMulti = !!quota && (quota.unlimited || quota.limit > 1)

  // Selecting here also drives the sidebar switcher (and therefore Agents /
  // Analytics / Inbox) — this page is not a separate, disconnected selection.
  const selectBot = (bot: Chatbot | null) => {
    setSelected(bot)
    setCurrentChatbotId(bot?.id ?? null)
  }

  const loadChatbots = () => {
    apiClient.getChatbots()
      .then((data: Chatbot[]) => {
        setChatbots(data)
        // Follow the globally selected chatbot when it's still valid, so this
        // page always reflects whatever the sidebar switcher has selected.
        setSelected(prev =>
          data.find(c => c.id === currentChatbotId)
          ?? data.find(c => c.id === prev?.id)
          ?? data.find(c => c.is_default)
          ?? data[0]
          ?? null
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const refreshQuota = () => apiClient.getChatbotQuota().then(setQuota).catch(() => {})

  useEffect(() => { loadChatbots(); refreshQuota() }, [])

  // React to the sidebar switcher changing while this page is open.
  useEffect(() => {
    if (currentChatbotId && currentChatbotId !== selected?.id) {
      const bot = chatbots.find(c => c.id === currentChatbotId)
      if (bot) setSelected(bot)
    }
  }, [currentChatbotId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the color picker's draft in sync with whichever bot is selected.
  useEffect(() => {
    setColorDraft(selected?.theme_color || DEFAULT_THEME_COLOR)
    setEditingDesc(false)
    try {
      setTopicsDraft(selected?.quick_topics ? JSON.parse(selected.quick_topics) : [])
    } catch {
      setTopicsDraft([])
    }
    try {
      setBadgesDraft(selected?.trust_badges ? JSON.parse(selected.trust_badges) : [])
    } catch {
      setBadgesDraft([])
    }
    // Stat metrics live in their own table -- fetch them for the selected bot.
    if (selected?.slug) {
      apiClient.getStatMetrics(selected.slug)
        .then(r => setStatsDraft(r.metrics.map((m: { value: string; label: string }) => ({ value: m.value, label: m.label }))))
        .catch(() => setStatsDraft([]))
    } else {
      setStatsDraft([])
    }
    try {
      const raw = selected?.homepage_sections_override
      const parsed = raw ? JSON.parse(raw) : null
      const sections: string[] = Array.isArray(parsed?.sections)
        ? parsed.sections.filter((s: unknown) => typeof s === 'string' && SECTION_OPTIONS.some(o => o.id === s))
        : []
      setUseAiSections(sections.length === 0)
      setPickedSections(sections)
      setPromoText(parsed?.overrides?.promo?.text || '')
    } catch {
      setUseAiSections(true)
      setPickedSections([])
      setPromoText('')
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true); setError('')
    try {
      const created = await apiClient.createChatbot({ slug: slugify(name), display_name: name })
      setNewName(''); setShowCreate(false)
      selectBot(created)
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
      if (selected?.id === bot.id) {
        const fallback = chatbots.find(c => c.id !== bot.id && c.is_default) ?? null
        selectBot(fallback)
      }
      loadChatbots(); refreshQuota()
    } catch { setError('Could not delete chatbot.') }
  }

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  const startRename = () => {
    if (!selected) return
    setNameDraft(selected.display_name)
    setRenaming(true)
  }

  const saveRename = async () => {
    if (!selected) return
    const name = nameDraft.trim()
    if (!name || name === selected.display_name) { setRenaming(false); return }
    setSavingName(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { display_name: name })
      selectBot(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      setRenaming(false)
      flashSaved()
    } catch {
      setError('Could not rename chatbot.')
    } finally {
      setSavingName(false)
    }
  }

  const startDesc = () => {
    if (!selected) return
    setDescDraft(selected.description || '')
    setEditingDesc(true)
  }

  const saveDesc = async () => {
    if (!selected) return
    setSavingDesc(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { description: descDraft.trim() })
      selectBot(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditingDesc(false)
      flashSaved()
    } catch {
      setError('Could not update description.')
    } finally {
      setSavingDesc(false)
    }
  }

  // The native color picker fires onChange continuously while dragging inside
  // it — only update the local preview here, no network call per pixel moved.
  const previewColor = (color: string) => setColorDraft(color)

  // Explicit "Save" click (or Enter) sends the one request for the picked color.
  const saveColor = async () => {
    if (!selected || colorDraft === (selected.theme_color || DEFAULT_THEME_COLOR)) return
    setSavingColor(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { theme_color: colorDraft })
      selectBot(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Could not update theme color.')
    } finally {
      setSavingColor(false)
    }
  }

  const toggleActive = async (val: boolean) => {
    if (!selected) return
    if (!val && !confirm(
      `Deactivate "${selected.display_name}"? Its direct link will stop answering until reactivated. ` +
      `Existing conversations already open won't be affected.`
    )) return
    setSavingActive(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { active: val })
      selectBot(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not update status.')
    } finally {
      setSavingActive(false)
    }
  }

  const chatLink = selected
    ? `${window.location.origin}/${spaceSlug}${selected.is_default ? '' : `/${selected.slug}`}`
    : ''

  const copyLink = () => {
    if (!chatLink) return
    navigator.clipboard.writeText(chatLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

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

  const handleToggleHomepageSections = async (val: boolean) => {
    if (!selected) return
    setSelected({ ...selected, homepage_sections_enabled: val })
    setSavingHomepageSections(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { homepage_sections_enabled: val })
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Could not update homepage sections setting.')
    } finally {
      setSavingHomepageSections(false)
    }
  }

  // "Use AI recommendation" is immediate (like the toggles above) -- switching
  // it on clears the manual override right away. Switching it off just reveals
  // the picker below; nothing is saved until the admin clicks "Save sections".
  const handleToggleUseAiSections = async (val: boolean) => {
    if (!selected) return
    setUseAiSections(val)
    if (!val) return
    setSavingUseAiSections(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, { homepage_sections_override: '' })
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Could not switch to AI-recommended sections.')
    } finally {
      setSavingUseAiSections(false)
    }
  }

  const toggleSection = (id: string) =>
    setPickedSections(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const moveSection = (id: string, dir: -1 | 1) =>
    setPickedSections(prev => {
      const idx = prev.indexOf(id)
      const swapWith = idx + dir
      if (idx === -1 || swapWith < 0 || swapWith >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
      return next
    })

  const saveSectionOverride = async () => {
    if (!selected) return
    setSavingSectionOverride(true)
    try {
      const payload: { sections: string[]; overrides?: { promo: { text: string } } } = { sections: pickedSections }
      if (pickedSections.includes('promo') && promoText.trim()) {
        payload.overrides = { promo: { text: promoText.trim() } }
      }
      const updated = await apiClient.updateChatbot(selected.slug, {
        homepage_sections_override: pickedSections.length ? JSON.stringify(payload) : '',
      })
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      flashSaved()
    } catch {
      setError('Could not save section preferences.')
    } finally {
      setSavingSectionOverride(false)
    }
  }

  const addTopicRow = () => setTopicsDraft(prev => [...prev, { label: '', prompt: '' }])
  const removeTopicRow = (i: number) => setTopicsDraft(prev => prev.filter((_, idx) => idx !== i))
  const updateTopicRow = (i: number, field: 'label' | 'prompt', value: string) =>
    setTopicsDraft(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))

  const saveTopics = async () => {
    if (!selected) return
    const cleaned = topicsDraft.filter(t => t.label.trim() && t.prompt.trim())
    setSavingTopics(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, {
        quick_topics: cleaned.length ? JSON.stringify(cleaned) : '',
      })
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      setTopicsDraft(cleaned)
      flashSaved()
    } catch {
      setError('Could not save quick topics. Each topic needs a label and a prompt (max 6 topics).')
    } finally {
      setSavingTopics(false)
    }
  }

  const addBadgeRow = () => setBadgesDraft(prev => [...prev, ''])
  const removeBadgeRow = (i: number) => setBadgesDraft(prev => prev.filter((_, idx) => idx !== i))
  const updateBadgeRow = (i: number, value: string) =>
    setBadgesDraft(prev => prev.map((b, idx) => idx === i ? value : b))

  const saveBadges = async () => {
    if (!selected) return
    const cleaned = badgesDraft.map(b => b.trim()).filter(Boolean)
    setSavingBadges(true)
    try {
      const updated = await apiClient.updateChatbot(selected.slug, {
        trust_badges: cleaned.length ? JSON.stringify(cleaned) : '',
      })
      setSelected(updated)
      setChatbots(prev => prev.map(c => c.id === updated.id ? updated : c))
      setBadgesDraft(cleaned)
      flashSaved()
    } catch {
      setError('Could not save trust badges (max 6).')
    } finally {
      setSavingBadges(false)
    }
  }

  const addStatRow = () => setStatsDraft(prev => [...prev, { value: '', label: '' }])
  const removeStatRow = (i: number) => setStatsDraft(prev => prev.filter((_, idx) => idx !== i))
  const updateStatRow = (i: number, field: 'value' | 'label', v: string) =>
    setStatsDraft(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: v } : s))

  const saveStats = async () => {
    if (!selected) return
    const cleaned = statsDraft
      .map(s => ({ value: s.value.trim(), label: s.label.trim() }))
      .filter(s => s.value && s.label)
    setSavingStats(true)
    try {
      const r = await apiClient.setStatMetrics(selected.slug, cleaned)
      setStatsDraft(r.metrics.map(m => ({ value: m.value, label: m.label })))
      flashSaved()
    } catch {
      setError('Could not save trust metrics. Each needs a value and a label (max 4).')
    } finally {
      setSavingStats(false)
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
                  onClick={() => selectBot(bot)}
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

      {/* Name + shareable link */}
      {selected && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            {renaming ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false) }}
                  autoFocus
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm font-semibold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
                <Button size="sm" disabled={savingName || !nameDraft.trim()} onClick={saveRename}>
                  {savingName ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selected.display_name}</h3>
                <button title="Rename" onClick={startRename} className="p-1 text-gray-400 hover:text-indigo-500">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false) }}
                  rows={2}
                  autoFocus
                  placeholder="What this chatbot is for (shown only to you, not customers)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500 resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={savingDesc} onClick={saveDesc}>
                    {savingDesc ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingDesc(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button onClick={startDesc} className="w-full text-left group">
                <p className={`text-sm ${selected.description ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500 italic'}`}>
                  {selected.description || 'Add a description…'}
                  <Pencil className="w-3 h-3 inline-block ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <code className="flex-1 min-w-0 truncate text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg">
              {chatLink}
            </code>
            <Button size="sm" variant="secondary" onClick={copyLink}>
              {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {linkCopied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
            Share this link directly with customers to chat with this specific chatbot.
          </p>
        </Card>
      )}

      {/* Logo editor */}
      {selected && (
        <Card className="p-5 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Logo</h3>

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

          {homepageSectionsPlatformEnabled && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">AI homepage sections</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  When on, the pre-chat welcome screen is composed from AI-recommended sections
                  (or your own picks below) instead of the default greeting and suggestion chips.
                </p>
              </div>
              <Toggle
                checked={selected.homepage_sections_enabled}
                onChange={handleToggleHomepageSections}
                disabled={savingHomepageSections}
              />
            </div>
          )}

          {homepageSectionsPlatformEnabled && selected.homepage_sections_enabled && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Which sections show, and in what order</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Leave on AI recommendation, or pick your own sections and order.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Use AI recommendation</span>
                  <Toggle checked={useAiSections} onChange={handleToggleUseAiSections} disabled={savingUseAiSections} />
                </div>
              </div>

              {!useAiSections && (
                <div className="mt-3 space-y-1.5">
                  {[...pickedSections, ...SECTION_OPTIONS.filter(o => !pickedSections.includes(o.id)).map(o => o.id)]
                    .map(id => SECTION_OPTIONS.find(o => o.id === id)!)
                    .map((opt, idx) => {
                      const checked = pickedSections.includes(opt.id)
                      const pos = pickedSections.indexOf(opt.id)
                      return (
                        <div key={opt.id}>
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSection(opt.id)}
                              className="w-3.5 h-3.5 accent-indigo-600 flex-shrink-0"
                            />
                            <span className={`flex-1 text-sm ${checked ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                              {opt.label}
                            </span>
                            {checked && (
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => moveSection(opt.id, -1)}
                                  disabled={pos === 0}
                                  className="p-1 text-gray-400 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => moveSection(opt.id, 1)}
                                  disabled={pos === pickedSections.length - 1}
                                  className="p-1 text-gray-400 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          {checked && opt.id === 'promo' && (
                            <input
                              value={promoText}
                              onChange={e => setPromoText(e.target.value)}
                              placeholder="Promo banner text (e.g. Limited-time offer on term plans)"
                              className="w-full mt-1.5 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                            />
                          )}
                          {idx === pickedSections.length - 1 && idx < SECTION_OPTIONS.length - 1 && (
                            <div className="h-px my-1.5" />
                          )}
                        </div>
                      )
                    })}
                  <div className="pt-1">
                    <Button size="sm" disabled={savingSectionOverride || pickedSections.length === 0} onClick={saveSectionOverride}>
                      {savingSectionOverride ? 'Saving…' : 'Save sections'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {homepageSectionsPlatformEnabled && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick topics</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
                Buttons shown on the welcome screen — clicking one starts the chat with that prompt.
                Up to 6. Leave empty to let AI-recommended sections handle it instead.
              </p>
              <div className="space-y-2">
                {topicsDraft.map((topic, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={topic.label}
                      onChange={e => updateTopicRow(i, 'label', e.target.value)}
                      placeholder="Label (e.g. Term Insurance)"
                      className="w-40 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <input
                      value={topic.prompt}
                      onChange={e => updateTopicRow(i, 'prompt', e.target.value)}
                      placeholder="Prompt sent when clicked"
                      className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => removeTopicRow(i)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                {topicsDraft.length < 6 && (
                  <Button size="sm" variant="secondary" onClick={addTopicRow}>
                    <Plus className="w-3.5 h-3.5" /> Add topic
                  </Button>
                )}
                <Button size="sm" disabled={savingTopics} onClick={saveTopics}>
                  {savingTopics ? 'Saving…' : 'Save topics'}
                </Button>
              </div>
            </div>
          )}

          {homepageSectionsPlatformEnabled && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Trust badges</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
                Short trust signals shown on the welcome screen (e.g. "IRDAI Registered", "4.8★ Rating"). Up to 6.
              </p>
              <div className="space-y-2">
                {badgesDraft.map((badge, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={badge}
                      onChange={e => updateBadgeRow(i, e.target.value)}
                      placeholder="e.g. IRDAI Registered"
                      className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => removeBadgeRow(i)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                {badgesDraft.length < 6 && (
                  <Button size="sm" variant="secondary" onClick={addBadgeRow}>
                    <Plus className="w-3.5 h-3.5" /> Add badge
                  </Button>
                )}
                <Button size="sm" disabled={savingBadges} onClick={saveBadges}>
                  {savingBadges ? 'Saving…' : 'Save badges'}
                </Button>
              </div>
            </div>
          )}

          {homepageSectionsPlatformEnabled && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Trust metrics</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
                Optional. Your own verified headline numbers for the welcome screen (e.g. "99.5%" / "Claims settled"). Up to 4. Leave empty to let AI generate them.
              </p>
              <div className="space-y-2">
                {statsDraft.map((stat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={stat.value}
                      onChange={e => updateStatRow(i, 'value', e.target.value)}
                      placeholder="99.5%"
                      className="w-24 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <input
                      value={stat.label}
                      onChange={e => updateStatRow(i, 'label', e.target.value)}
                      placeholder="Claims settled"
                      className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => removeStatRow(i)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                {statsDraft.length < 4 && (
                  <Button size="sm" variant="secondary" onClick={addStatRow}>
                    <Plus className="w-3.5 h-3.5" /> Add metric
                  </Button>
                )}
                <Button size="sm" disabled={savingStats} onClick={saveStats}>
                  {savingStats ? 'Saving…' : 'Save metrics'}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme color</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Accent color used in this chatbot's widget header and send button.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorDraft}
                onChange={e => previewColor(e.target.value)}
                disabled={savingColor}
                className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer bg-transparent"
              />
              <code className="text-xs text-gray-500 dark:text-gray-400">{colorDraft}</code>
              {colorDraft !== (selected.theme_color || DEFAULT_THEME_COLOR) && (
                <Button size="sm" disabled={savingColor} onClick={saveColor}>
                  {savingColor ? 'Saving…' : 'OK'}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Status */}
      {selected && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Chatbot active</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {selected.is_default
                  ? "The default chatbot can't be deactivated — it's what your main link answers as."
                  : 'When off, this chatbot\'s direct link stops answering until reactivated.'}
              </p>
            </div>
            <Toggle
              checked={selected.active}
              onChange={toggleActive}
              disabled={savingActive || selected.is_default}
            />
          </div>
        </Card>
      )}
    </div>
  )
}
