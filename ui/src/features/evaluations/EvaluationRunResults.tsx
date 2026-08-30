import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  MinusCircle,
  Route,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import type { EvaluationCase, EvaluationCheck, EvaluationResult, EvaluationRun } from '../../api/client'

interface Props {
  runs: EvaluationRun[]
  results: EvaluationResult[]
  cases: EvaluationCase[]
  selectedRunId: string | null
  loadingRuns: boolean
  loadingResults: boolean
  onSelectRun: (runId: string) => void
}

function percent(run: EvaluationRun): string {
  if (run.total_cases === 0) return '—'
  return `${Math.round((run.passed_cases / run.total_cases) * 100)}%`
}

function checkIcon(check: EvaluationCheck) {
  if (check.status === 'passed') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (check.status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />
  return <MinusCircle className="h-4 w-4 text-gray-400" />
}

function checkLabel(name: string): string {
  return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function EvaluationRunResults({
  runs,
  results,
  cases,
  selectedRunId,
  loadingRuns,
  loadingResults,
  onSelectRun,
}: Props) {
  const caseNames = Object.fromEntries(cases.map(testCase => [testCase.id, testCase.name]))

  return (
    <section className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Runs and results</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Published-runtime evidence and deterministic checks</p>
      </div>

      <div className="border-b border-gray-100 p-3 dark:border-white/10">
        {loadingRuns && <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />}
        {!loadingRuns && runs.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
            No runs yet. Add an enabled case, then run the suite.
          </div>
        )}
        {!loadingRuns && runs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {runs.map(run => {
              const selected = run.id === selectedRunId
              return (
                <button
                  key={run.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectRun(run.id)}
                  className={`min-w-[12rem] rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/50 dark:bg-indigo-500/15'
                      : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                      {new Date(run.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                  <span className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="capitalize">{run.status}</span>
                    <strong className={run.failed_cases > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      {percent(run)} · {run.passed_cases}/{run.total_cases}
                    </strong>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="max-h-[45rem] space-y-3 overflow-y-auto p-3">
        {loadingResults && [0, 1].map(item => (
          <div key={item} className="h-56 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
        ))}

        {!loadingResults && selectedRunId && results.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            This run contains no case results.
          </div>
        )}

        {!loadingResults && results.map(result => (
          <article
            key={result.id}
            className={`overflow-hidden rounded-xl border ${
              result.passed
                ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/25 dark:bg-emerald-500/5'
                : 'border-red-200 bg-red-50/40 dark:border-red-500/25 dark:bg-red-500/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                  {caseNames[result.case_id] ?? `Case ${result.case_id.slice(0, 8)}`}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-gray-400">{result.case_id}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                result.passed
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
              }`}>
                {result.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {result.passed ? 'Passed' : 'Failed'}
              </span>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <span className="rounded-lg bg-white/80 p-2 text-gray-600 dark:bg-white/5 dark:text-gray-300">
                  <Route className="mb-1 h-3.5 w-3.5 text-indigo-500" />
                  Agent<br /><strong className="text-gray-900 dark:text-white">{result.actual_agent ?? 'Unknown'}</strong>
                </span>
                <span className="rounded-lg bg-white/80 p-2 text-gray-600 dark:bg-white/5 dark:text-gray-300">
                  <Clock3 className="mb-1 h-3.5 w-3.5 text-indigo-500" />
                  Latency<br /><strong className="text-gray-900 dark:text-white">{result.response_ms === null ? '—' : `${result.response_ms}ms`}</strong>
                </span>
                <span className="rounded-lg bg-white/80 p-2 text-gray-600 dark:bg-white/5 dark:text-gray-300">
                  <Database className="mb-1 h-3.5 w-3.5 text-indigo-500" />
                  RAG used<br /><strong className="text-gray-900 dark:text-white">{result.actual_rag_hit ? 'Yes' : 'No'}</strong>
                </span>
                <span className="rounded-lg bg-white/80 p-2 text-gray-600 dark:bg-white/5 dark:text-gray-300">
                  <ShieldAlert className="mb-1 h-3.5 w-3.5 text-indigo-500" />
                  Escalation<br /><strong className="text-gray-900 dark:text-white">{result.actual_escalated ? 'Requested' : 'No'}</strong>
                </span>
              </div>

              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actual response</h4>
                <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 dark:border-white/10 dark:bg-black/10 dark:text-gray-200">
                  {result.actual_response || 'No response was produced.'}
                </p>
              </div>

              {result.actual_source_ids.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Sources</h4>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {result.actual_source_ids.map(source => (
                      <span key={source} className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-[10px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Checks</h4>
                <div className="mt-1.5 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-black/10">
                  {result.checks.map(check => (
                    <div key={check.name} className="flex items-start gap-2.5 px-3 py-2.5">
                      <span className="mt-0.5 shrink-0">{checkIcon(check)}</span>
                      <span className="min-w-0">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                          {checkLabel(check.name)} · <span className="capitalize">{check.status}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{check.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
