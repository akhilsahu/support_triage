import { useEffect, useState } from 'react'
import { Check, Loader2, Trash2, FileText } from 'lucide-react'

// One extracted or hand-entered fact.
//
// Unconfirmed rows are visually distinct and carry a Confirm button, because
// nothing here reaches an agent until a human accepts it. That gate is the
// point of the feature: the source table lists "SBI Card MILES PRIME" one row
// above "SBI Card PRIME", so an auto-accepted match is a confidently wrong fee
// rather than a missing one — and a wrong fee is worse than no answer.
//
// Editing saves on blur, matching the Q&A pattern already used on this screen.

export interface Fact {
  id: string
  topic?: string | null
  subject: string
  label: string
  value: string
  note?: string | null
  source_filename?: string | null
  source_page?: number | null
  verified: boolean
}

export function FactRow({
  fact, topics, onSave, onDelete,
}: {
  fact: Fact
  topics: string[]
  onSave: (patch: Partial<Fact>) => Promise<void>
  onDelete: () => void
}) {
  const [label, setLabel] = useState(fact.label)
  const [value, setValue] = useState(fact.value)
  const [note,  setNote]  = useState(fact.note || '')
  const [busy,  setBusy]  = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setLabel(fact.label); setValue(fact.value); setNote(fact.note || '') },
    [fact.label, fact.value, fact.note])

  const dirty = label !== fact.label || value !== fact.value || note !== (fact.note || '')

  async function commit(patch: Partial<Fact>) {
    setBusy(true)
    try {
      await onSave(patch)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setBusy(false)
    }
  }

  const cell = 'px-2 py-1 text-sm bg-transparent border border-transparent rounded-md hover:border-gray-200 dark:hover:border-gray-700 focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-800 text-gray-900 dark:text-white'

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
      fact.verified
        ? 'border-gray-200 dark:border-gray-700'
        : 'border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-900/10'
    }`}>
      <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-1">
        <input value={label} onChange={e => setLabel(e.target.value)}
          onBlur={() => dirty && commit({ label, value, note })}
          className={`${cell} font-medium`} placeholder="Attribute" />
        <input value={value} onChange={e => setValue(e.target.value)}
          onBlur={() => dirty && commit({ label, value, note })}
          className={cell} placeholder="Value" />
        <input value={note} onChange={e => setNote(e.target.value)}
          onBlur={() => dirty && commit({ label, value, note })}
          className={`${cell} col-span-2 text-gray-500 dark:text-gray-400`}
          placeholder="Condition (optional) — e.g. waived on annual spends of ₹3 Lakh" />

        <div className="col-span-2 flex items-center gap-2 px-2 text-xs text-gray-400">
          {/* Provenance matters more here than elsewhere: a fact is injected
              into the prompt rather than retrieved, so this is the only trail
              back to where the number came from. */}
          {fact.source_filename && (
            <span className="inline-flex items-center gap-1 truncate">
              <FileText className="w-3 h-3 flex-shrink-0" />
              {fact.source_filename}{fact.source_page ? ` · p.${fact.source_page}` : ''}
            </span>
          )}
          <select
            value={fact.topic || ''}
            onChange={e => commit({ topic: e.target.value })}
            className="ml-auto bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-300 focus:outline-none focus:border-indigo-400"
          >
            <option value="">no topic — reaches every agent</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {busy  && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
          {saved && <span className="text-emerald-500">Saved</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 pt-1">
        {!fact.verified && (
          <button onClick={() => commit({ verified: true })} disabled={busy}
            title="Confirm — makes this visible to agents"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50">
            <Check className="w-3 h-3" /> Confirm
          </button>
        )}
        <button onClick={onDelete} title="Delete"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
