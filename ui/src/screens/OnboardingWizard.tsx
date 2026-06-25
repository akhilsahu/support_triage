import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import {
  Upload, FileText, CheckCircle, ArrowRight, Loader2, Sparkles,
  X, Copy, ExternalLink, Bot, BookOpen, Globe, Cpu, Link, Database,
} from 'lucide-react'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import gemLogo from '../assets/images/logos/gem.jpg'

type KnowledgeTab = 'file' | 'text' | 'qna'
interface Suggestion { name: string; description: string; agent_type: string; system_prompt: string; icon?: string }

const STEPS = [
  { label: 'Welcome',      num: 1, hint: "Let's begin"       },
  { label: 'Upload Docs',  num: 2, hint: 'Almost there'      },
  { label: 'Your Agent',   num: 3, hint: 'Just one more step' },
  { label: "You're Live",  num: 4, hint: 'All done!'          },
]

const inputCls =
  'w-full px-4 py-3 text-sm text-gray-900 bg-white border border-gray-200 rounded-xl ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-all'

export function OnboardingWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isQuick = searchParams.get('quick') === 'true'
  const { token, spaceSlug, spaceName, setOnboardingComplete } = useAppStore()

  const [step, setStep]               = useState(isQuick ? 2 : 1)
  const [kbTab, setKbTab]             = useState<KnowledgeTab>('file')
  const [file, setFile]               = useState<File | null>(null)
  const [textContent, setText]        = useState('')
  const [qnaQ, setQnaQ]               = useState('')
  const [qnaA, setQnaA]               = useState('')
  const [uploading, setUploading]     = useState(false)
  const [kbId, setKbId]               = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [suggestion, setSuggestion]         = useState<Suggestion | null>(null)
  const [agentName, setAgentName]           = useState('')
  const [systemPrompt, setSystemPrompt]     = useState('')
  const [loadingSuggestion, setLoadingSugg] = useState(false)
  const [creatingAgent, setCreatingAgent]   = useState(false)
  const [agentError, setAgentError]         = useState('')
  const [copied, setCopied]                 = useState(false)

  const fetchSuggestion = async (resolvedKbId: string) => {
    setLoadingSugg(true)
    try {
      const r = await apiClient.getAgentSuggestion(resolvedKbId ? { kb_ids: [resolvedKbId] } : { agent_name: spaceName })
      setSuggestion(r)
      setAgentName(r.name || `${spaceName} Support Agent`)
      setSystemPrompt(r.system_prompt || '')
    } catch {
      setAgentName(`${spaceName} Support Agent`)
      setSystemPrompt(
        `You are a customer support agent for ${spaceName}.\n\n` +
        `Your role:\n` +
        `- Answer customer questions accurately using the knowledge base provided\n` +
        `- Be professional, concise, and helpful\n` +
        `- If you cannot resolve the issue, escalate to human support\n\n` +
        `Constraints:\n` +
        `- Do not make up information — if unsure, say so\n` +
        `- Stay on topic relevant to the business`
      )
    } finally { setLoadingSugg(false) }
  }

  useEffect(() => {
    if (step === 3 && !loadingSuggestion && !suggestion) {
      fetchSuggestion(kbId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (!token) return <Navigate to="/app/login" replace />

  const embedCode = `<script src="https://api.support247.chat/api/v1/widget/embed.js" data-space="${spaceSlug}" defer></script>`

  const skipAll = async () => {
    await apiClient.markOnboardingComplete().catch(() => {})
    setOnboardingComplete(true)
    navigate('/app/dashboard')
  }

  const handleKnowledgeNext = async () => {
    setUploading(true)
    try {
      let id = ''
      const kb = await apiClient.createKB({ name: `${spaceName} Knowledge Base` })
      id = kb.id
      if (kbTab === 'file' && file) {
        const doc = await apiClient.uploadDoc(file, undefined, 'general', kb.name)
        await apiClient.addKBItem(id, { item_type: 'doc', title: file.name, doc_id: doc.doc_id || doc.id })
      } else if (kbTab === 'text') {
        await apiClient.addKBItem(id, { item_type: 'text', title: 'Knowledge', content: textContent.trim() })
      } else if (kbTab === 'qna') {
        await apiClient.addKBItem(id, { item_type: 'qna', question: qnaQ.trim(), content: qnaA.trim() })
      }
      setKbId(id)
      setStep(3)
    } catch (e) { console.error(e) }
    finally { setUploading(false) }
  }

  const handleCreateAgent = async () => {
    setCreatingAgent(true)
    setAgentError('')
    try {
      await apiClient.createOrgAgent({
        name: agentName.trim() || `${spaceName} Agent`,
        description: suggestion?.description || '',
        icon: suggestion?.icon || '',
        system_prompt: systemPrompt.trim() || suggestion?.system_prompt || '',
        rag_enabled: !!kbId,
        kb_ids: kbId ? [kbId] : [],
      })
      await apiClient.markOnboardingComplete()
      setOnboardingComplete(true)
      setStep(4)
    } catch (e: any) {
      setAgentError(e?.response?.data?.detail || 'Failed to create agent.')
    } finally { setCreatingAgent(false) }
  }

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canNext =
    (kbTab === 'file' && !!file) ||
    (kbTab === 'text' && !!textContent.trim()) ||
    (kbTab === 'qna'  && !!qnaQ.trim() && !!qnaA.trim())

  const progressPct = ((step - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 flex flex-col items-center justify-start py-10 px-4">

      {/* Top bar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          {isQuick && (
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/70 text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <img src={gemLogo} alt="Support247" className="h-8 w-8 rounded-xl object-cover shadow-sm" />
          <span className="text-sm font-bold text-gray-800 tracking-tight">Support247</span>
        </div>
        {step < 4 && (
          <button onClick={skipAll} className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2">
            Skip setup
          </button>
        )}
      </div>

      {/* Progress bar + step labels */}
      <div className="w-full max-w-2xl mb-8">
        {/* Encouragement text */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest">
            Step {step} of {STEPS.length}
          </p>
          <p className="text-xs text-gray-500 font-medium">{STEPS[step - 1].hint}</p>
        </div>

        {/* Track */}
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Step chips */}
        <div className="flex justify-between">
          {STEPS.map((s, i) => {
            const done   = step > i + 1
            const active = step === i + 1
            return (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
                  ${done   ? 'bg-emerald-500 border-emerald-500 text-white' :
                    active ? 'bg-white border-violet-500 text-violet-600 shadow-md shadow-violet-100' :
                             'bg-white border-gray-200 text-gray-300'}`}
                >
                  {done ? <CheckCircle className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span className={`text-[11px] font-semibold hidden sm:block transition-colors ${
                  active ? 'text-violet-700' : done ? 'text-emerald-600' : 'text-gray-300'
                }`}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main card */}
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl shadow-indigo-100/60 border border-indigo-100/60 overflow-hidden">

        {/* Card top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />

        <div className="p-8 sm:p-10">

          {/* ── Step 1: Welcome ─────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-200 flex-shrink-0">
                  <img src={gemLogo} alt="" className="w-9 h-9 rounded-xl object-cover" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    Welcome, {spaceName}!
                  </h1>
                  <p className="text-base text-gray-600 mt-0.5">
                    Set up your AI support agent in 3 quick steps.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-9">
                {[
                  {
                    icon: Upload,
                    color: 'from-violet-500 to-purple-500',
                    bg: 'bg-violet-50',
                    border: 'border-violet-100',
                    title: 'Upload Docs',
                    sub: 'Add your FAQs, policies, or any content your agent should know',
                    step: '1',
                  },
                  {
                    icon: Bot,
                    color: 'from-indigo-500 to-blue-500',
                    bg: 'bg-indigo-50',
                    border: 'border-indigo-100',
                    title: 'Meet Your Agent',
                    sub: 'We auto-generate an agent from your content — edit freely',
                    step: '2',
                  },
                  {
                    icon: Globe,
                    color: 'from-blue-500 to-cyan-500',
                    bg: 'bg-blue-50',
                    border: 'border-blue-100',
                    title: 'Go Live',
                    sub: 'Share a link or paste a small snippet on your website',
                    step: '3',
                  },
                ].map(({ icon: Icon, color, bg, border, title, sub, step: sNum }) => (
                  <div key={title} className={`${bg} border ${border} rounded-2xl p-5 flex flex-col gap-3`}>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{sub}</p>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Step {sNum}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-base font-bold rounded-2xl transition-all shadow-md shadow-violet-200 hover:shadow-lg hover:shadow-violet-300 flex items-center justify-center gap-2"
              >
                Let's get started <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── Step 2: Upload Docs ─────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload your docs</h2>
                <p className="text-base text-gray-600">
                  Your agent reads this content to answer customer questions accurately.
                </p>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1.5 bg-gray-100 rounded-2xl mb-6">
                {([
                  ['file', Upload,    'Upload a File'],
                  ['text', FileText,  'Paste Text'],
                  ['qna',  BookOpen,  'Q & A'],
                ] as [KnowledgeTab, React.ElementType, string][]).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    onClick={() => setKbTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                      kbTab === tab
                        ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* File upload */}
              {kbTab === 'file' && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                    file
                      ? 'border-violet-300 bg-violet-50/50'
                      : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/30 bg-gray-50'
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                    accept=".pdf,.txt,.docx,.md,.csv"
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-violet-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-base font-bold text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB · Ready to upload</p>
                      </div>
                      <CheckCircle className="w-6 h-6 text-emerald-500 ml-2 flex-shrink-0" />
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center mx-auto mb-4 shadow-md shadow-violet-200">
                        <Upload className="w-7 h-7 text-white" />
                      </div>
                      <p className="text-base font-bold text-gray-800 mb-1">Click to upload your file</p>
                      <p className="text-sm text-gray-500">or drag and drop it here</p>
                      <p className="text-xs text-gray-400 mt-3 bg-gray-100 inline-block px-3 py-1 rounded-full">
                        PDF · TXT · DOCX · Markdown · CSV
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Paste text */}
              {kbTab === 'text' && (
                <div className="relative">
                  <textarea
                    value={textContent}
                    onChange={e => setText(e.target.value)}
                    placeholder="Paste your product descriptions, FAQs, return policies, or anything your agent should know about your business..."
                    rows={7}
                    className={`${inputCls} resize-none leading-relaxed`}
                  />
                  {textContent && (
                    <span className="absolute bottom-3 right-3 text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded">
                      {textContent.length} chars
                    </span>
                  )}
                </div>
              )}

              {/* Q&A */}
              {kbTab === 'qna' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">Question</label>
                    <input
                      value={qnaQ}
                      onChange={e => setQnaQ(e.target.value)}
                      placeholder="e.g. What is your return policy?"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">Answer</label>
                    <textarea
                      value={qnaA}
                      onChange={e => setQnaA(e.target.value)}
                      placeholder="e.g. We offer 30-day hassle-free returns on all items purchased from our store..."
                      rows={5}
                      className={`${inputCls} resize-none leading-relaxed`}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-7">
                <button
                  onClick={() => setStep(3)}
                  disabled={uploading}
                  className="px-6 py-3.5 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={handleKnowledgeNext}
                  disabled={uploading || !canNext}
                  className="flex-1 py-3.5 text-sm font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-all shadow-md shadow-violet-100 flex items-center justify-center gap-2"
                >
                  {uploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    : <>Save & Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Agent ───────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Meet your agent</h2>
                <p className="text-base text-gray-600">
                  {loadingSuggestion
                    ? 'We\'re reading your content and building a suggestion…'
                    : 'We\'ve pre-filled everything. Review and tweak as needed.'}
                </p>
              </div>

              {loadingSuggestion ? (
                <div className="flex flex-col items-center justify-center py-16 gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-200">
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-gray-800">Building your agent…</p>
                    <p className="text-sm text-gray-500 mt-1">Reading your knowledge base</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">

                  {/* Description badge */}
                  {suggestion?.description && (
                    <div className="flex items-start gap-3 px-4 py-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl">
                      <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-indigo-800 leading-relaxed">{suggestion.description}</p>
                    </div>
                  )}

                  {/* Agent name */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Agent Name</label>
                    <input
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Support Agent, Policy Bot…"
                    />
                  </div>

                  {/* System prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-gray-900">Instructions for the agent</label>
                      <span className="text-xs font-semibold text-violet-600 flex items-center gap-1 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-100">
                        <Sparkles className="w-3 h-3" /> AI written
                      </span>
                    </div>
                    <textarea
                      value={systemPrompt}
                      onChange={e => setSystemPrompt(e.target.value)}
                      rows={8}
                      placeholder="Describe how your agent should behave, its tone, and what topics it should help customers with…"
                      className={`${inputCls} resize-none leading-relaxed font-mono text-xs`}
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Feel free to edit — this is just a starting point.</p>
                  </div>

                  {/* KB badge */}
                  {kbId && (
                    <div className="flex items-center gap-3 px-4 py-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Docs attached</p>
                        <p className="text-xs text-emerald-600">Your agent will answer from your uploaded content</p>
                      </div>
                    </div>
                  )}

                  {agentError && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{agentError}</p>
                  )}

                  <button
                    onClick={handleCreateAgent}
                    disabled={creatingAgent || !agentName.trim()}
                    className="w-full py-4 text-base font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-all shadow-md shadow-violet-200 flex items-center justify-center gap-2"
                  >
                    {creatingAgent
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating your agent…</>
                      : <><Bot className="w-5 h-5" /> Create My Agent</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Go Live ─────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200 flex-shrink-0">
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">You're all set!</h2>
                  <p className="text-base text-gray-600 mt-0.5">Your agent is live. Share it or embed it below.</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">

                {/* Direct link */}
                <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Link className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Share a link</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-medium text-gray-800 bg-white border border-gray-200 px-4 py-2.5 rounded-xl truncate">
                      support247.chat/{spaceSlug}
                    </code>
                    <a
                      href={`https://support247.chat/${spaceSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2.5 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 transition-colors flex-shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Embed snippet */}
                <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Copy className="w-3.5 h-3.5 text-violet-600" />
                      </div>
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Embed on your website</p>
                    </div>
                    <button
                      onClick={copyEmbed}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                        copied
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50'
                      }`}
                    >
                      {copied ? <><CheckCircle className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy code</>}
                    </button>
                  </div>
                  <code className="block text-xs font-mono text-emerald-400 bg-gray-900 px-4 py-3.5 rounded-xl break-all leading-relaxed">
                    {embedCode}
                  </code>
                  <p className="text-xs text-gray-500 mt-2">Paste this snippet just before the <code className="text-gray-700">&lt;/body&gt;</code> tag on any page.</p>
                </div>
              </div>

              <button
                onClick={() => navigate('/app/dashboard')}
                className="w-full py-4 text-base font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl transition-all shadow-md shadow-violet-200 hover:shadow-lg hover:shadow-violet-300 flex items-center justify-center gap-2"
              >
                Go to dashboard <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">Support247 · Your AI-powered support platform</p>
    </div>
  )
}
