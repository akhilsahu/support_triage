import { CircleOff, FlaskConical, Plus } from 'lucide-react'
import type { EvaluationCase } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { formatExpectation } from './types'

interface Props {
  cases: EvaluationCase[]
  loading: boolean
  canCreate: boolean
  onCreate: () => void
}

export function EvaluationCaseList({ cases, loading, canCreate, onCreate }: Props) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Cases</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Questions and deterministic expectations</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onCreate} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> Add case
        </Button>
      </div>

      <div className="max-h-[38rem] space-y-3 overflow-y-auto p-3">
        {loading && [0, 1, 2].map(item => (
          <div key={item} className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
        ))}

        {!loading && !canCreate && (
          <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Select a suite to inspect its cases.
          </div>
        )}

        {!loading && canCreate && cases.length === 0 && (
          <div className="px-4 py-12 text-center">
            <FlaskConical className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">No cases in this suite</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add one customer question and its expected behavior.</p>
            <Button size="sm" className="mt-4" onClick={onCreate}>
              <Plus className="h-4 w-4" /> Add first case
            </Button>
          </div>
        )}

        {!loading && cases.map(testCase => {
          const labels = formatExpectation(testCase.expectation)
          return (
            <article key={testCase.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{testCase.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{testCase.question}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  testCase.enabled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                }`}>
                  {testCase.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {labels.length > 0 ? labels.map(label => (
                  <span key={label} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                    {label}
                  </span>
                )) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                    <CircleOff className="h-3 w-3" /> Response recorded only
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
