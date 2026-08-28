import { useEffect, useRef, useState } from 'react'
import { Tag, Check, Loader2 } from 'lucide-react'

// The topic control on a knowledge-base document row.
//
// A topic groups the documents that describe one thing — a card's brochure, its
// T&C and a share of a shared fee schedule — and an agent scopes to topics
// rather than to individual documents. It is deliberately typed by the owner,
// not inferred: nothing can tell "SBI Card MILES PRIME" from "SBI Card PRIME"
// without being told, and guessing attaches the wrong fee to the wrong card.
//
// It is stored slugified because retrieval filters on exact equality, so
// "SBI Prime CC" and "sbi prime cc" have to collapse to one key or the filter
// silently matches nothing. The slug is shown back as you type for that reason
// — the value that gets saved should never be a surprise.

/** Mirrors app/utils/slug.py — shown as a preview only; the server re-slugifies. */
export function slugify(value: string): string {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
    .replace(/^_|_$/g, '')
}

export function TopicPicker({
  value, known, onSave, agentCount,
}: {
  value?: string | null
  known: string[]              // topics already used in this space, for reuse
  onSave: (topic: string) => Promise<void>
  agentCount?: number          // how many agents read this topic today
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value || '')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const slug    = slugify(draft)
  const changed = slug !== (value || '')

  async function commit() {
    setEditing(false)
    if (!changed) return
    setSaving(true)
    try {
      await onSave(slug)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={value ? `Topic: ${value}` : 'Set a topic to group this with related documents'}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
          value
            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
            : 'border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:text-indigo-500 hover:border-indigo-400'
        }`}
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" />
          : saved ? <Check className="w-3 h-3" />
          : <Tag className="w-3 h-3" />}
        {value || 'set topic'}
        {/* What will actually happen, rather than what was intended. An owner
            who tags a shared document wants to see that both agents pick it up. */}
        {value && agentCount !== undefined && (
          <span className="text-xs font-normal opacity-70">
            · {agentCount === 0 ? 'no agent reads this' : `${agentCount} agent${agentCount > 1 ? 's' : ''}`}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <input
        ref={inputRef}
        list="kb-known-topics"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
        }}
        placeholder="e.g. sbi_prime_cc"
        className="w-44 px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-indigo-400 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-900 dark:text-white"
      />
      <datalist id="kb-known-topics">
        {known.map(t => <option key={t} value={t} />)}
      </datalist>
      {slug !== draft.trim() && draft.trim() !== '' && (
        <span className="text-xs text-gray-400 font-mono">saves as: {slug || '—'}</span>
      )}
    </div>
  )
}
