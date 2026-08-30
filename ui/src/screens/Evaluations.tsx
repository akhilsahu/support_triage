import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertCircle, Clock3, FlaskConical, Play, RefreshCw, ShieldCheck, Target, XCircle } from 'lucide-react'
import {
  apiClient,
  type EvaluationCase,
  type EvaluationCaseCreate,
  type EvaluationResult,
  type EvaluationRun,
  type EvaluationSuite,
  type EvaluationSuiteCreate,
} from '../api/client'
import { Button } from '../components/ui/Button'
import { EvaluationCaseList } from '../features/evaluations/EvaluationCaseList'
import {
  ConfirmRunDialog,
  CreateCaseDialog,
  CreateSuiteDialog,
} from '../features/evaluations/EvaluationDialogs'
import { EvaluationRunResults } from '../features/evaluations/EvaluationRunResults'
import { EvaluationSuiteList } from '../features/evaluations/EvaluationSuiteList'
import { runDuration, type EvaluationChatbotOption } from '../features/evaluations/types'
import { useAppStore } from '../store/useAppStore'

function apiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">{icon}{label}</div>
      <p className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

export function Evaluations() {
  const currentChatbotId = useAppStore(state => state.currentChatbotId)
  const [chatbots, setChatbots] = useState<EvaluationChatbotOption[]>([])
  const [suites, setSuites] = useState<EvaluationSuite[]>([])
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [cases, setCases] = useState<EvaluationCase[]>([])
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [results, setResults] = useState<EvaluationResult[]>([])

  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingCases, setLoadingCases] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingResults, setLoadingResults] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pageError, setPageError] = useState('')

  const [suiteDialogOpen, setSuiteDialogOpen] = useState(false)
  const [caseDialogOpen, setCaseDialogOpen] = useState(false)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [savingSuite, setSavingSuite] = useState(false)
  const [savingCase, setSavingCase] = useState(false)
  const [running, setRunning] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const selectedSuite = useMemo(
    () => suites.find(suite => suite.id === selectedSuiteId) ?? null,
    [suites, selectedSuiteId],
  )
  const latestRun = runs[0] ?? null
  const enabledCases = cases.filter(testCase => testCase.enabled)
  const chatbotNames = useMemo(
    () => Object.fromEntries(chatbots.map(chatbot => [chatbot.id, chatbot.display_name])),
    [chatbots],
  )

  const loadInitial = useCallback(async () => {
    setInitialLoading(true)
    setLoadError('')
    try {
      const [chatbotRows, suiteRows] = await Promise.all([
        apiClient.getChatbots() as Promise<EvaluationChatbotOption[]>,
        apiClient.listEvaluationSuites(),
      ])
      setChatbots(chatbotRows)
      setSuites(suiteRows)
      setSelectedSuiteId(previous => {
        const chatbotSuite = suiteRows.find(suite => suite.chatbot_id === currentChatbotId)
        if (chatbotSuite) return chatbotSuite.id
        if (previous && suiteRows.some(suite => suite.id === previous)) return previous
        return suiteRows[0]?.id ?? null
      })
    } catch (error) {
      setLoadError(apiError(error, 'Could not load evaluation suites.'))
    } finally {
      setInitialLoading(false)
    }
  }, [currentChatbotId])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!selectedSuiteId) {
      setCases([])
      setRuns([])
      setSelectedRunId(null)
      setResults([])
      return
    }

    let cancelled = false
    setLoadingCases(true)
    setLoadingRuns(true)
    setPageError('')
    Promise.all([
      apiClient.listEvaluationCases(selectedSuiteId),
      apiClient.listEvaluationRuns(selectedSuiteId),
    ])
      .then(([caseRows, runRows]) => {
        if (cancelled) return
        setCases(caseRows)
        setRuns(runRows)
        setSelectedRunId(previous => (
          previous && runRows.some(run => run.id === previous) ? previous : runRows[0]?.id ?? null
        ))
        if (runRows.length === 0) setResults([])
      })
      .catch(error => {
        if (!cancelled) setPageError(apiError(error, 'Could not load this suite.'))
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCases(false)
          setLoadingRuns(false)
        }
      })

    return () => { cancelled = true }
  }, [selectedSuiteId])

  useEffect(() => {
    if (!selectedRunId) {
      setResults([])
      return
    }
    let cancelled = false
    setLoadingResults(true)
    apiClient.listEvaluationResults(selectedRunId)
      .then(rows => { if (!cancelled) setResults(rows) })
      .catch(error => { if (!cancelled) setPageError(apiError(error, 'Could not load run results.')) })
      .finally(() => { if (!cancelled) setLoadingResults(false) })
    return () => { cancelled = true }
  }, [selectedRunId])

  const openSuiteDialog = () => {
    setDialogError('')
    setSuiteDialogOpen(true)
  }
  const openCaseDialog = () => {
    setDialogError('')
    setCaseDialogOpen(true)
  }
  const openRunDialog = () => {
    setDialogError('')
    setRunDialogOpen(true)
  }

  const createSuite = async (payload: EvaluationSuiteCreate) => {
    setSavingSuite(true)
    setDialogError('')
    try {
      const created = await apiClient.createEvaluationSuite(payload)
      setSuites(previous => [created, ...previous])
      setSelectedSuiteId(created.id)
      setSuiteDialogOpen(false)
    } catch (error) {
      setDialogError(apiError(error, 'Could not create the evaluation suite.'))
    } finally {
      setSavingSuite(false)
    }
  }

  const createCase = async (payload: EvaluationCaseCreate) => {
    if (!selectedSuiteId) return
    setSavingCase(true)
    setDialogError('')
    try {
      const created = await apiClient.createEvaluationCase(selectedSuiteId, payload)
      setCases(previous => [...previous, created])
      setCaseDialogOpen(false)
    } catch (error) {
      setDialogError(apiError(error, 'Could not create the evaluation case.'))
    } finally {
      setSavingCase(false)
    }
  }

  const runSuite = async () => {
    if (!selectedSuiteId) return
    setRunning(true)
    setDialogError('')
    setPageError('')
    try {
      const completed = await apiClient.runEvaluationSuite(selectedSuiteId)
      const refreshedRuns = await apiClient.listEvaluationRuns(selectedSuiteId)
      setRuns(refreshedRuns.some(run => run.id === completed.id) ? refreshedRuns : [completed, ...refreshedRuns])
      setSelectedRunId(completed.id)
      setRunDialogOpen(false)
    } catch (error) {
      setDialogError(apiError(error, 'The evaluation run could not be completed.'))
    } finally {
      setRunning(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <div className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />)}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/30 dark:bg-white/5">
          <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
          <h1 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">Evaluation Lab unavailable</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{loadError}</p>
          <Button className="mt-5" onClick={() => void loadInitial()}><RefreshCw className="h-4 w-4" /> Retry</Button>
        </div>
      </div>
    )
  }

  const passRate = latestRun && latestRun.total_cases > 0
    ? `${Math.round((latestRun.passed_cases / latestRun.total_cases) * 100)}%`
    : '—'

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 pb-20 sm:p-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Evaluation Lab</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Published runtime
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Protect routing, retrieval, answers, escalation intent, and latency with repeatable chatbot checks.
          </p>
        </div>
        <Button
          size="lg"
          onClick={openRunDialog}
          disabled={!selectedSuite?.chatbot_id || enabledCases.length === 0 || running}
          title={!selectedSuite?.chatbot_id ? 'Select a suite assigned to a chatbot' : enabledCases.length === 0 ? 'Add an enabled case first' : undefined}
        >
          <Play className="h-4 w-4" /> {running ? 'Evaluation running…' : 'Run suite'}
        </Button>
      </header>

      {pageError && (
        <div aria-live="polite" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" /> {pageError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setPageError('')}><XCircle className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<FlaskConical className="h-4 w-4 text-indigo-500" />} label="Enabled cases" value={String(enabledCases.length)} />
        <Metric icon={<Target className="h-4 w-4 text-indigo-500" />} label="Latest pass rate" value={passRate} />
        <Metric icon={<XCircle className="h-4 w-4 text-red-500" />} label="Latest failures" value={latestRun ? String(latestRun.failed_cases) : '—'} />
        <Metric icon={<Clock3 className="h-4 w-4 text-indigo-500" />} label="Latest duration" value={latestRun ? runDuration(latestRun.started_at, latestRun.completed_at) : 'Not run yet'} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(14rem,0.75fr)_minmax(20rem,1.15fr)_minmax(24rem,1.6fr)]">
        <EvaluationSuiteList
          suites={suites}
          selectedSuiteId={selectedSuiteId}
          chatbotNames={chatbotNames}
          loading={false}
          onSelect={setSelectedSuiteId}
          onCreate={openSuiteDialog}
        />
        <EvaluationCaseList cases={cases} loading={loadingCases} canCreate={Boolean(selectedSuite)} onCreate={openCaseDialog} />
        <EvaluationRunResults
          runs={runs}
          results={results}
          cases={cases}
          selectedRunId={selectedRunId}
          loadingRuns={loadingRuns}
          loadingResults={loadingResults}
          onSelectRun={setSelectedRunId}
        />
      </div>

      <CreateSuiteDialog
        open={suiteDialogOpen}
        chatbots={chatbots}
        defaultChatbotId={currentChatbotId}
        saving={savingSuite}
        error={dialogError}
        onClose={() => !savingSuite && setSuiteDialogOpen(false)}
        onSubmit={payload => void createSuite(payload)}
      />
      <CreateCaseDialog
        open={caseDialogOpen}
        suite={selectedSuite}
        saving={savingCase}
        error={dialogError}
        onClose={() => !savingCase && setCaseDialogOpen(false)}
        onSubmit={payload => void createCase(payload)}
      />
      <ConfirmRunDialog
        open={runDialogOpen}
        suite={selectedSuite}
        caseCount={enabledCases.length}
        running={running}
        error={dialogError}
        onClose={() => !running && setRunDialogOpen(false)}
        onConfirm={() => void runSuite()}
      />
    </div>
  )
}
