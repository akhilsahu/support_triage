import { AlertTriangle, Bot, Plus, ShieldCheck } from 'lucide-react'
import type { EvaluationSuite } from '../../api/client'
import { Button } from '../../components/ui/Button'

interface Props {
  suites: EvaluationSuite[]
  selectedSuiteId: string | null
  chatbotNames: Record<string, string>
  loading: boolean
  onSelect: (suiteId: string) => void
  onCreate: () => void
}

export function EvaluationSuiteList({
  suites,
  selectedSuiteId,
  chatbotNames,
  loading,
  onSelect,
  onCreate,
}: Props) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Suites</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Regression collections</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onCreate} aria-label="Create evaluation suite">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <div className="space-y-2 p-3">
        {loading && [0, 1, 2].map(item => (
          <div key={item} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
        ))}

        {!loading && suites.length === 0 && (
          <div className="px-3 py-10 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">No suites yet</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Create a suite to group questions that should never regress.
            </p>
            <Button size="sm" className="mt-4" onClick={onCreate}>
              <Plus className="h-4 w-4" /> Create suite
            </Button>
          </div>
        )}

        {!loading && suites.map(suite => {
          const selected = suite.id === selectedSuiteId
          return (
            <button
              key={suite.id}
              type="button"
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(suite.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                selected
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-white'
                  : 'border-transparent bg-gray-50 text-gray-800 hover:border-gray-200 hover:bg-white dark:bg-white/5 dark:text-gray-200 dark:hover:border-white/10 dark:hover:bg-white/10'
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">{suite.name}</span>
                {suite.critical && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" /> Critical
                  </span>
                )}
              </span>
              <span className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Bot className="h-3.5 w-3.5" />
                {suite.chatbot_id ? chatbotNames[suite.chatbot_id] ?? 'Assigned chatbot' : 'Manual grading only'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
