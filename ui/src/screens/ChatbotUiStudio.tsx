import { useEffect, useState, useCallback } from 'react'
import { apiClient, type HomepagePayload, type HomepageSnapshot } from '../api/client'
import { SectionRenderer } from '../renderengine/homepage'
import type { SectionTheme } from '../renderengine/homepage/types'

// Dashboard "Chatbot UI" studio: generate the pre-chat welcome once (a real
// blocking build), edit it, preview it exactly as customers see it, and publish
// it as a frozen snapshot the public endpoint serves with zero live LLM calls.
// Draft (edited/previewed here) is separate from published (served); publishing
// copies draft -> published.

const PREVIEW_THEME: SectionTheme = {
  textPrimary: 'text-white',
  textSecondary: 'text-indigo-100/70',
  textMuted: 'text-indigo-200/50',
  chipCls: 'bg-white/[0.05] border border-white/[0.09] text-indigo-200/70',
  chipHoverCls: 'hover:bg-white/[0.08]',
}

const SECTION_LABELS: Record<string, string> = {
  hero: 'Intro', key_benefits: 'Highlights', capabilities: 'What I can help with',
  suggested_questions: 'Suggested questions', faq: 'FAQ', quick_topics: 'Quick topics',
  trust_badges: 'Trust badges', promo: 'Promo banner', data_block: 'Data block',
  stat_band: 'Trust metrics', process_steps: 'How it works', comparison: 'Comparison',
}
const label = (id: string) => SECTION_LABELS[id] || id

const inputCls =
  'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-400'

// ── small reusable editors ──────────────────────────────────────────────────

function StringList({ items, onChange, max = 8, placeholder = 'Text' }: {
  items: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      {items.map((val, i) => (
        <div key={i} className="flex gap-1.5">
          <input className={inputCls} value={val} placeholder={placeholder}
            onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="px-2 text-gray-400 hover:text-red-500"
            onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {items.length < max && (
        <button className="text-xs text-indigo-500 hover:text-indigo-600"
          onClick={() => onChange([...items, ''])}>+ Add</button>
      )}
    </div>
  )
}

interface Pair { a: string; b: string }
function PairList({ items, onChange, aLabel, bLabel, max = 6, bMultiline = false }: {
  items: Pair[]; onChange: (v: Pair[]) => void; aLabel: string; bLabel: string; max?: number; bMultiline?: boolean
}) {
  const set = (i: number, key: 'a' | 'b', v: string) =>
    onChange(items.map((x, j) => (j === i ? { ...x, [key]: v } : x)))
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <div className="flex-1 space-y-1">
            <input className={inputCls} value={it.a} placeholder={aLabel} onChange={e => set(i, 'a', e.target.value)} />
            {bMultiline
              ? <textarea className={inputCls} rows={2} value={it.b} placeholder={bLabel} onChange={e => set(i, 'b', e.target.value)} />
              : <input className={inputCls} value={it.b} placeholder={bLabel} onChange={e => set(i, 'b', e.target.value)} />}
          </div>
          <button className="px-2 pt-1.5 text-gray-400 hover:text-red-500"
            onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {items.length < max && (
        <button className="text-xs text-indigo-500 hover:text-indigo-600"
          onClick={() => onChange([...items, { a: '', b: '' }])}>+ Add</button>
      )}
    </div>
  )
}

// ── per-section editor ──────────────────────────────────────────────────────

function SectionEditor({ id, draft, patch }: {
  id: string; draft: HomepagePayload; patch: (p: Partial<HomepagePayload>) => void
}) {
  switch (id) {
    case 'hero':
      return <textarea className={inputCls} rows={3} value={draft.description || ''}
        placeholder="Intro line shown at the top of the welcome"
        onChange={e => patch({ description: e.target.value })} />
    case 'key_benefits':
      return <StringList items={draft.key_benefits || []} onChange={v => patch({ key_benefits: v })} placeholder="Benefit" />
    case 'capabilities':
      return <StringList items={draft.capabilities || []} onChange={v => patch({ capabilities: v })} placeholder="Capability" />
    case 'trust_badges':
      return <StringList items={draft.trust_badges || []} onChange={v => patch({ trust_badges: v })} placeholder="Badge" />
    case 'suggested_questions':
      return <StringList items={draft.suggestions || []} max={4} onChange={v => patch({ suggestions: v })} placeholder="Question" />
    case 'faq':
      return <PairList aLabel="Question" bLabel="Answer" bMultiline
        items={(draft.faq || []).map(f => ({ a: f.question, b: f.answer }))}
        onChange={v => patch({ faq: v.map(p => ({ question: p.a, answer: p.b })) })} />
    case 'quick_topics':
      return <PairList aLabel="Label" bLabel="Prompt sent on click"
        items={(draft.quick_topics || []).map(t => ({ a: t.label, b: t.prompt }))}
        onChange={v => patch({ quick_topics: v.map(p => ({ label: p.a, prompt: p.b })) })} />
    case 'stat_band':
      return (
        <div className="space-y-2">
          <PairList aLabel="Value (e.g. 99.5%)" bLabel="Label (e.g. Claims settled)"
            items={(draft.stat_band?.stats || []).map(s => ({ a: s.value, b: s.label }))}
            onChange={v => patch({ stat_band: {
              stats: v.map(p => ({ value: p.a, label: p.b })),
              illustrative: draft.stat_band?.illustrative ?? true,
              disclaimer: draft.stat_band?.disclaimer || '',
            } as HomepagePayload['stat_band'] })} />
          <input className={inputCls} placeholder="Disclaimer" value={draft.stat_band?.disclaimer || ''}
            onChange={e => draft.stat_band && patch({ stat_band: { ...draft.stat_band, disclaimer: e.target.value } })} />
        </div>
      )
    case 'process_steps':
      return (
        <div className="space-y-2">
          <input className={inputCls} placeholder="Section title" value={draft.process_steps?.title || ''}
            onChange={e => patch({ process_steps: { title: e.target.value, steps: draft.process_steps?.steps || [] } })} />
          <PairList aLabel="Step label" bLabel="Detail" bMultiline
            items={(draft.process_steps?.steps || []).map(s => ({ a: s.label, b: s.body || '' }))}
            onChange={v => patch({ process_steps: {
              title: draft.process_steps?.title || '',
              steps: v.map(p => ({ label: p.a, body: p.b })),
            } })} />
        </div>
      )
    case 'comparison':
    case 'data_block':
      return <p className="text-xs text-gray-500 dark:text-gray-400 italic">
        Generated content shown in the preview. Deep editing of this block is coming soon —
        for now you can reorder or remove it, or regenerate.
      </p>
    default:
      return null
  }
}

// ── main studio ─────────────────────────────────────────────────────────────

export function ChatbotUiStudio({ slug, chatbotName, logoUrl, themeColor }: {
  slug: string; chatbotName: string; logoUrl?: string | null; themeColor?: string | null
}) {
  const [snap, setSnap] = useState<HomepageSnapshot | null>(null)
  const [draft, setDraft] = useState<HomepagePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'' | 'generate' | 'save' | 'publish' | 'unpublish'>('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError(''); setDirty(false)
    apiClient.getHomepageUi(slug)
      .then(s => { setSnap(s); setDraft(s.draft_payload) })
      .catch(() => setError('Could not load the saved UI.'))
      .finally(() => setLoading(false))
  }, [slug])

  const patch = useCallback((p: Partial<HomepagePayload>) => {
    setDraft(d => ({ ...(d || {}), ...p })); setDirty(true)
  }, [])

  const sections = draft?.homepage_sections || []
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= sections.length) return
    const next = [...sections];[next[i], next[j]] = [next[j], next[i]]
    patch({ homepage_sections: next })
  }
  const removeSection = (id: string) => patch({ homepage_sections: sections.filter(s => s !== id) })
  const removedSections = draft
    ? Object.keys(SECTION_LABELS).filter(id =>
        !sections.includes(id) && (id === 'hero' || (draft as Record<string, unknown>)[
          id === 'suggested_questions' ? 'suggestions'
          : id === 'promo' ? 'section_overrides' : id] != null))
    : []

  const generate = async () => {
    setBusy('generate'); setError('')
    try {
      const s = await apiClient.generateHomepageUi(slug)
      setSnap(s); setDraft(s.draft_payload); setDirty(false)
    } catch { setError('Generation failed. Please try again.') }
    finally { setBusy('') }
  }
  const saveDraft = async () => {
    if (!draft) return
    setBusy('save'); setError('')
    try { const s = await apiClient.saveHomepageUiDraft(slug, draft); setSnap({ ...s }); setDirty(false) }
    catch { setError('Could not save your edits.') }
    finally { setBusy('') }
  }
  const publish = async () => {
    setBusy('publish'); setError('')
    try {
      if (dirty && draft) await apiClient.saveHomepageUiDraft(slug, draft)
      const r = await apiClient.publishHomepageUi(slug)
      setSnap(s => s ? { ...s, published: true, published_at: r.published_at } : s); setDirty(false)
    } catch { setError('Publish failed.') }
    finally { setBusy('') }
  }
  const unpublish = async () => {
    setBusy('unpublish'); setError('')
    try { await apiClient.unpublishHomepageUi(slug); setSnap(s => s ? { ...s, published: false, published_at: null } : s) }
    catch { setError('Could not unpublish.') }
    finally { setBusy('') }
  }

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Loading…</p>

  const published = snap?.published
  const genAt = snap?.generated_at ? new Date(snap.generated_at).toLocaleString() : null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Chatbot UI</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-lg">
            Generate the pre-chat welcome once, edit it, and publish it. Once published, customers get
            the saved UI instantly with no per-visit AI generation.
          </p>
        </div>
        <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
          published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
          {published ? 'Published' : draft ? 'Draft' : 'Not generated'}
        </span>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={generate} disabled={!!busy}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy === 'generate' ? 'Generating… (~30s)' : draft ? 'Regenerate' : 'Create UI'}
        </button>
        {draft && (
          <button onClick={saveDraft} disabled={!!busy || !dirty}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">
            {busy === 'save' ? 'Saving…' : 'Save draft'}
          </button>
        )}
        {draft && !published && (
          <button onClick={publish} disabled={!!busy}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
        )}
        {draft && published && (
          <>
            <button onClick={publish} disabled={!!busy || !dirty}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
              {busy === 'publish' ? 'Publishing…' : 'Publish changes'}
            </button>
            <button onClick={unpublish} disabled={!!busy}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              {busy === 'unpublish' ? '…' : 'Unpublish'}
            </button>
          </>
        )}
        {genAt && <span className="text-xs text-gray-400 self-center">Generated {genAt}</span>}
      </div>

      {!draft && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Click <b>Create UI</b> to generate the welcome from the bot's knowledge base and live web
          research. It takes about 30 seconds.
        </p>
      )}

      {draft && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Preview */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Preview</p>
            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-[#0b0b14]">
              <div className="px-5 py-6 max-h-[560px] overflow-y-auto">
                <SectionRenderer
                  sections={sections}
                  theme={PREVIEW_THEME}
                  space={{ name: chatbotName, description: draft.description, logo_url: logoUrl || undefined }}
                  suggestions={draft.suggestions || []}
                  onSend={() => {}}
                  overrides={draft.section_overrides}
                  keyBenefits={draft.key_benefits}
                  capabilities={draft.capabilities}
                  faq={draft.faq}
                  quickTopics={draft.quick_topics}
                  trustBadges={draft.trust_badges}
                  dataBlock={draft.data_block}
                  statBand={draft.stat_band}
                  processSteps={draft.process_steps}
                  comparison={draft.comparison}
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Theme color: {themeColor || 'default'} · shown in the live widget's own theme.</p>
          </div>

          {/* Editor */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Sections &amp; content</p>
            <div className="space-y-2.5">
              {sections.map((id, i) => (
                <div key={id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label(id)}</span>
                    <div className="flex items-center gap-1 text-gray-400">
                      <button className="px-1 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                        disabled={i === 0} onClick={() => moveSection(i, -1)}>↑</button>
                      <button className="px-1 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                        disabled={i === sections.length - 1} onClick={() => moveSection(i, 1)}>↓</button>
                      <button className="px-1 hover:text-red-500" onClick={() => removeSection(id)}>Remove</button>
                    </div>
                  </div>
                  <SectionEditor id={id} draft={draft} patch={patch} />
                </div>
              ))}
            </div>

            {removedSections.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-gray-400">Add back:</span>
                {removedSections.map(id => (
                  <button key={id} className="text-xs px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
                    onClick={() => patch({ homepage_sections: [...sections, id] })}>+ {label(id)}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
