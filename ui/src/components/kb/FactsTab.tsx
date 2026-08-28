import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { apiClient } from '../../api/client'
import { FactRow, type Fact } from './FactRow'

// Confirmed attributes injected into every answer, rather than searched for.
//
// Retrieval finds the passage most similar to a question; it cannot guarantee a
// specific figure arrives. "What is the annual fee?" is a lookup, and the value
// often sits in a shared document listing twenty products where the wanted row
// competes with nineteen near-identical ones. Facts are the deterministic layer
// over that.

export function FactsTab({
  kbId, docs, topics,
}: {
  kbId:   string
  docs:   { id: string; doc_id?: string; title?: string }[]
  topics: string[]
}) {
  const qc = useQueryClient()
  const [extractDoc, setExtractDoc] = useState('')
  const [error, setError] = useState('')

  const { data: facts, isLoading } = useQuery<Fact[]>({
    queryKey: ['kb-facts', kbId],
    queryFn: () => apiClient.listFacts(kbId),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['kb-facts', kbId] })

  const extract = useMutation({
    mutationFn: (docId: string) => apiClient.extractFacts(kbId, docId),
    onSuccess: () => { setError(''); invalidate() },
    // "0 facts" and "the provider is out of credit" need different actions, so
    // the server distinguishes them and this surfaces the distinction.
    onError: (e: any) => setError(e?.response?.data?.detail || 'Extraction failed.'),
  })

  const save   = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Fact> }) =>
      apiClient.updateFact(kbId, id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteFact(kbId, id),
    onSuccess: invalidate,
  })
  const add = useMutation({
    mutationFn: () => apiClient.createFact(kbId, {
      subject: 'New subject', label: 'Attribute', value: 'Value',
    }),
    onSuccess: invalidate,
  })

  const rows      = facts || []
  const pending   = rows.filter(f => !f.verified)
  const confirmed = rows.filter(f => f.verified)

  // Grouped by subject so near-identical names sit side by side — the whole
  // point of review is spotting that "X MILES PRIME" and "X PRIME" are two
  // different things that must not share a fee.
  const group = (list: Fact[]) =>
    Object.entries(
      list.reduce<Record<string, Fact[]>>((acc, f) => {
        (acc[f.subject] ||= []).push(f); return acc
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b))

  const extractable = docs.filter(d => d.doc_id)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={extractDoc}
          onChange={e => setExtractDoc(e.target.value)}
          className="px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Extract facts from…</option>
          {extractable.map(d => (
            <option key={d.id} value={d.doc_id}>{d.title || d.doc_id}</option>
          ))}
        </select>
        <button
          onClick={() => extractDoc && extract.mutate(extractDoc)}
          disabled={!extractDoc || extract.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {extract.isPending
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading document…</>
            : <><Sparkles className="w-3.5 h-3.5" /> Extract</>}
        </button>
        <button onClick={() => add.mutate()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add manually
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-500">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {/* Re-running replaces this document's unreviewed rows. Said out loud
          because extraction is not deterministic — a second pass returns a
          different subset, and accumulating them would bury the reviewer. */}
      {extract.isPending && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Re-running replaces this document's unconfirmed facts. Confirmed ones are kept.
        </p>
      )}

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 dark:text-gray-400">No facts yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Extract them from a document, or add one by hand. Facts are quoted
            exactly in every answer, so they are worth getting right.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {pending.length} awaiting confirmation — not visible to agents yet
          </p>
          {group(pending).map(([subject, list]) => (
            <div key={subject} className="space-y-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 px-1">{subject}</p>
              {list.map(f => (
                <FactRow key={f.id} fact={f} topics={topics}
                  onSave={patch => save.mutateAsync({ id: f.id, patch })}
                  onDelete={() => remove.mutate(f.id)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {confirmed.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {confirmed.length} in use
          </p>
          {group(confirmed).map(([subject, list]) => (
            <div key={subject} className="space-y-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 px-1">{subject}</p>
              {list.map(f => (
                <FactRow key={f.id} fact={f} topics={topics}
                  onSave={patch => save.mutateAsync({ id: f.id, patch })}
                  onDelete={() => remove.mutate(f.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
