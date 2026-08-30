import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, FlaskConical, Play, Plus, X } from 'lucide-react'
import type { EvaluationCaseCreate, EvaluationSuite, EvaluationSuiteCreate } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Toggle } from '../../components/ui/Toggle'
import { splitCommaValues, type BooleanExpectation, type EvaluationChatbotOption } from './types'

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300'
const fieldControl = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-gray-800 dark:text-white'

interface DialogFrameProps {
  open: boolean
  title: string
  description: string
  busy: boolean
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

function DialogFrame({ open, title, description, busy, onClose, children, footer }: DialogFrameProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  const titleId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-title`

  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => { busyRef.current = busy }, [busy])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current()
    }
    document.addEventListener('keydown', handleKey)
    window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={event => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-white/10">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-6 py-4 dark:border-white/10 dark:bg-white/5">
          {footer}
        </div>
      </div>
    </div>
  )
}

interface CreateSuiteDialogProps {
  open: boolean
  chatbots: EvaluationChatbotOption[]
  defaultChatbotId: string | null
  saving: boolean
  error: string
  onClose: () => void
  onSubmit: (payload: EvaluationSuiteCreate) => void
}

export function CreateSuiteDialog({
  open,
  chatbots,
  defaultChatbotId,
  saving,
  error,
  onClose,
  onSubmit,
}: CreateSuiteDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [chatbotId, setChatbotId] = useState('')
  const [critical, setCritical] = useState(false)
  const [validation, setValidation] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setChatbotId(defaultChatbotId ?? chatbots.find(bot => bot.is_default)?.id ?? chatbots[0]?.id ?? '')
    setCritical(false)
    setValidation('')
  }, [open, defaultChatbotId, chatbots])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setValidation('Enter a suite name.')
    if (!chatbotId) return setValidation('Select a chatbot for this suite.')
    setValidation('')
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      chatbot_id: chatbotId,
      critical,
    })
  }

  return (
    <DialogFrame
      open={open}
      title="Create evaluation suite"
      description="Group cases that protect one chatbot from behavioral regressions."
      busy={saving}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="create-evaluation-suite" loading={saving}>
            <Plus className="h-4 w-4" /> Create suite
          </Button>
        </>
      )}
    >
      <form id="create-evaluation-suite" onSubmit={submit} className="space-y-5">
        {(validation || error) && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {validation || error}
          </p>
        )}
        <Input label="Suite name" required value={name} onChange={event => setName(event.target.value)} placeholder="Critical support regression" maxLength={120} />
        <div>
          <label htmlFor="evaluation-suite-chatbot" className={fieldLabel}>Chatbot</label>
          <select id="evaluation-suite-chatbot" className={fieldControl} value={chatbotId} onChange={event => setChatbotId(event.target.value)} required>
            <option value="">Select a chatbot</option>
            {chatbots.map(bot => <option key={bot.id} value={bot.id}>{bot.display_name}{bot.is_default ? ' (default)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="evaluation-suite-description" className={fieldLabel}>Description <span className="font-normal text-gray-400">Optional</span></label>
          <textarea id="evaluation-suite-description" className={`${fieldControl} min-h-24 resize-y`} value={description} onChange={event => setDescription(event.target.value)} placeholder="What regressions does this suite protect?" maxLength={5000} />
        </div>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-white">Critical suite</span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Highlight failures that should block a future release gate.</span>
          </span>
          <Toggle checked={critical} onChange={setCritical} />
        </label>
      </form>
    </DialogFrame>
  )
}

interface CreateCaseDialogProps {
  open: boolean
  suite: EvaluationSuite | null
  saving: boolean
  error: string
  onClose: () => void
  onSubmit: (payload: EvaluationCaseCreate) => void
}

export function CreateCaseDialog({ open, suite, saving, error, onClose, onSubmit }: CreateCaseDialogProps) {
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [expectedAgent, setExpectedAgent] = useState('')
  const [requiredTerms, setRequiredTerms] = useState('')
  const [forbiddenTerms, setForbiddenTerms] = useState('')
  const [sourceIds, setSourceIds] = useState('')
  const [rag, setRag] = useState<BooleanExpectation>('any')
  const [escalation, setEscalation] = useState<BooleanExpectation>('any')
  const [latency, setLatency] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [validation, setValidation] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setQuestion('')
    setExpectedAgent('')
    setRequiredTerms('')
    setForbiddenTerms('')
    setSourceIds('')
    setRag('any')
    setEscalation('any')
    setLatency('')
    setEnabled(true)
    setValidation('')
  }, [open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setValidation('Enter a case name.')
    if (!question.trim()) return setValidation('Enter the customer question to evaluate.')
    const parsedLatency = latency.trim() ? Number(latency) : null
    if (parsedLatency !== null && (!Number.isInteger(parsedLatency) || parsedLatency < 1 || parsedLatency > 300_000)) {
      return setValidation('Maximum response time must be a whole number from 1 to 300000 milliseconds.')
    }
    setValidation('')
    onSubmit({
      name: name.trim(),
      question: question.trim(),
      history: [],
      customer_context: {},
      expectation: {
        expected_agent: expectedAgent.trim() || null,
        required_terms: splitCommaValues(requiredTerms),
        forbidden_terms: splitCommaValues(forbiddenTerms),
        expected_source_ids: splitCommaValues(sourceIds),
        expected_rag_hit: rag === 'any' ? null : rag === 'yes',
        expected_escalation: escalation === 'any' ? null : escalation === 'yes',
        max_response_ms: parsedLatency,
      },
      enabled,
    })
  }

  return (
    <DialogFrame
      open={open}
      title="Add evaluation case"
      description={`Define one customer question and its expected behavior${suite ? ` for ${suite.name}` : ''}.`}
      busy={saving}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="create-evaluation-case" loading={saving}>
            <FlaskConical className="h-4 w-4" /> Add case
          </Button>
        </>
      )}
    >
      <form id="create-evaluation-case" onSubmit={submit} className="space-y-5">
        {(validation || error) && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {validation || error}
          </p>
        )}
        <Input label="Case name" required value={name} onChange={event => setName(event.target.value)} placeholder="Password reset answer" maxLength={160} />
        <div>
          <label htmlFor="evaluation-case-question" className={fieldLabel}>Customer question</label>
          <textarea id="evaluation-case-question" required className={`${fieldControl} min-h-28 resize-y`} value={question} onChange={event => setQuestion(event.target.value)} placeholder="How do I reset my password?" maxLength={20000} />
        </div>

        <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Expected behavior</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave fields empty or set to Any to skip that check.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Expected agent" value={expectedAgent} onChange={event => setExpectedAgent(event.target.value)} placeholder="account-support" maxLength={120} />
            <Input label="Maximum response time (ms)" type="number" min={1} max={300000} value={latency} onChange={event => setLatency(event.target.value)} placeholder="5000" />
            <Input label="Required terms" hint="Comma-separated" value={requiredTerms} onChange={event => setRequiredTerms(event.target.value)} placeholder="reset link, email" />
            <Input label="Forbidden terms" hint="Comma-separated" value={forbiddenTerms} onChange={event => setForbiddenTerms(event.target.value)} placeholder="password is 1234" />
            <Input label="Expected source IDs" hint="Comma-separated" value={sourceIds} onChange={event => setSourceIds(event.target.value)} placeholder="policy-reset-v2" containerClassName="sm:col-span-2" />
            <div>
              <label htmlFor="evaluation-case-rag" className={fieldLabel}>RAG used</label>
              <select id="evaluation-case-rag" className={fieldControl} value={rag} onChange={event => setRag(event.target.value as BooleanExpectation)}>
                <option value="any">Any</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
            <div>
              <label htmlFor="evaluation-case-escalation" className={fieldLabel}>Escalation requested</label>
              <select id="evaluation-case-escalation" className={fieldControl} value={escalation} onChange={event => setEscalation(event.target.value as BooleanExpectation)}>
                <option value="any">Any</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-white">Enabled</span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Include this case in published-runtime suite runs.</span>
          </span>
          <Toggle checked={enabled} onChange={setEnabled} />
        </label>
      </form>
    </DialogFrame>
  )
}

interface ConfirmRunDialogProps {
  open: boolean
  suite: EvaluationSuite | null
  caseCount: number
  running: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmRunDialog({ open, suite, caseCount, running, error, onClose, onConfirm }: ConfirmRunDialogProps) {
  return (
    <DialogFrame
      open={open}
      title="Run published evaluation"
      description={`Execute ${caseCount} enabled case${caseCount === 1 ? '' : 's'}${suite ? ` in ${suite.name}` : ''}.`}
      busy={running}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>Cancel</Button>
          <Button onClick={onConfirm} loading={running} disabled={caseCount === 0}>
            <Play className="h-4 w-4" /> {running ? 'Evaluation running…' : 'Run published suite'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" /> Real provider execution
          </h3>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <li>• Calls the chatbot's configured model and retrieval providers and may incur provider cost.</li>
            <li>• Tests the current customer-serving configuration; draft comparison is not available.</li>
            <li>• Runs synchronously and may take up to five minutes per case.</li>
            <li>• Does not create customer sessions, transfer conversations, or execute external business actions.</li>
          </ul>
        </div>
        {running && (
          <p aria-live="polite" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs leading-relaxed text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
            Keep this page open while the suite runs. Results will load automatically when the server completes every case.
          </p>
        )}
      </div>
    </DialogFrame>
  )
}
