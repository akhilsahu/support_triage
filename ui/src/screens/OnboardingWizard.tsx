import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Upload, FileText, CheckCircle, ArrowRight, Loader2, Sparkles, X, Copy, ExternalLink, SkipForward, Bot, BookOpen, Rocket, PartyPopper } from 'lucide-react'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'

type KnowledgeTab = 'file' | 'text' | 'qna'
interface Suggestion { name: string; description: string; agent_type: string; system_prompt: string; icon?: string }

const STEPS = [
  { label: 'Welcome',   icon: PartyPopper },
  { label: 'Knowledge', icon: BookOpen    },
  { label: 'Agent',     icon: Bot         },
  { label: 'Go Live',   icon: Rocket      },
]

export function OnboardingWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isQuick = searchParams.get('quick') === 'true'
  const { token, spaceSlug, spaceName, setOnboardingComplete } = useAppStore()

  const [step, setStep] = useState(isQuick ? 2 : 1)
  const [kbTab, setKbTab]         = useState<KnowledgeTab>('file')
  const [file, setFile]           = useState<File | null>(null)
  const [textContent, setText]    = useState('')
  const [qnaQ, setQnaQ]           = useState('')
  const [qnaA, setQnaA]           = useState('')
  const [uploading, setUploading] = useState(false)
  const [kbId, setKbId]           = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [suggestion, setSuggestion]           = useState<Suggestion | null>(null)
  const [agentName, setAgentName]             = useState('')
  const [systemPrompt, setSystemPrompt]       = useState('')
  const [loadingSuggestion, setLoadingSugg]   = useState(false)
  const [creatingAgent, setCreatingAgent]     = useState(false)
  const [copied, setCopied]                   = useState(false)

  const fetchSuggestion = async (resolvedKbId: string) => {
    setLoadingSugg(true)
    try {
      const r = await apiClient.getAgentSuggestion(resolvedKbId ? { kb_ids: [resolvedKbId] } : { agent_name: spaceName })
      setSuggestion(r)
      setAgentName(r.name || `${spaceName} Support Agent`)
      setSystemPrompt(r.system_prompt || '')
    } catch { setAgentName(`${spaceName} Support Agent`) }
    finally { setLoadingSugg(false) }
  }

  // Fire suggestion fetch whenever the agent step becomes active
  useEffect(() => {
    if (step === 3 && !loadingSuggestion && !suggestion) {
      fetchSuggestion(kbId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Guard after all hooks
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
    try {
      await apiClient.createOrgAgent({
        name: agentName.trim() || `${spaceName} Agent`,
        description: suggestion?.description || '',
        icon: suggestion?.icon || '🤖',
        system_prompt: systemPrompt.trim() || suggestion?.system_prompt || '',
        rag_enabled: !!kbId,
        kb_ids: kbId ? [kbId] : [],
      })
      await apiClient.markOnboardingComplete()
      setOnboardingComplete(true)
      setStep(4)
    } catch (e) { console.error(e) }
    finally { setCreatingAgent(false) }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-start pt-8 pb-20 px-4 relative overflow-hidden">

      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-purple-200/40 blur-3xl" />

      {/* ── Top bar ── */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-3">
          {isQuick && (
            <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-white shadow-sm hover:shadow-md text-gray-400 hover:text-gray-700 transition-all border border-gray-100">
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-sm border border-gray-100">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">
              {isQuick ? 'Quick Create' : 'Setup Wizard'}
            </span>
          </div>
        </div>

        {step < 4 && (
          <button
            onClick={skipAll}
            className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 font-bold text-sm rounded-full shadow-sm hover:shadow-md border border-gray-200 hover:border-gray-300 transition-all"
          >
            <SkipForward className="w-4 h-4" />
            Skip Setup
          </button>
        )}
      </div>

      {/* ── Step progress ── */}
      <div className="w-full max-w-2xl mb-8 relative z-10">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done    = step > i + 1
            const active  = step === i + 1
            const pending = step < i + 1
            return (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm
                    ${done    ? 'bg-indigo-600 text-white shadow-indigo-200 shadow-md' :
                      active  ? 'bg-white text-indigo-600 ring-2 ring-indigo-500 ring-offset-2 shadow-md' :
                                'bg-white text-gray-300 border border-gray-200'}`}
                  >
                    {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-[11px] font-bold whitespace-nowrap ${active ? 'text-indigo-600' : done ? 'text-indigo-400' : 'text-gray-300'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 mb-5 rounded-full overflow-hidden bg-gray-100">
                    <div className={`h-full bg-indigo-500 transition-all duration-500 ${done ? 'w-full' : 'w-0'}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Card ── */}
      <div className="w-full max-w-2xl relative z-10">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-100/50 border border-white/80 overflow-hidden">

          {/* Coloured top strip per step */}
          <div className={`h-1.5 w-full transition-all duration-500 ${
            step === 1 ? 'bg-gradient-to-r from-indigo-400 to-purple-400' :
            step === 2 ? 'bg-gradient-to-r from-blue-400 to-indigo-400' :
            step === 3 ? 'bg-gradient-to-r from-violet-400 to-indigo-500' :
                         'bg-gradient-to-r from-emerald-400 to-teal-400'
          }`} />

          <div className="p-10">

            {/* ── Step 1: Welcome ── */}
            {step === 1 && (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-4xl mb-6 shadow-lg shadow-indigo-200">
                  🎉
                </div>
                <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">
                  Welcome, <span className="text-indigo-600">{spaceName}</span>!
                </h1>
                <p className="text-lg text-gray-500 mb-10 leading-relaxed">
                  You're <strong className="text-gray-700">3 steps away</strong> from a live AI support agent.<br />No technical skills needed.
                </p>

                <div className="grid grid-cols-3 gap-4 mb-10">
                  {[
                    { emoji: '📚', color: 'from-blue-50 to-indigo-50', border: 'border-indigo-100', title: 'Add Knowledge', sub: 'Upload docs or paste text' },
                    { emoji: '🤖', color: 'from-violet-50 to-purple-50', border: 'border-purple-100', title: 'AI Builds Agent', sub: 'We handle the setup' },
                    { emoji: '🚀', color: 'from-emerald-50 to-teal-50', border: 'border-emerald-100', title: 'Go Live', sub: 'Share with customers' },
                  ].map(({ emoji, color, border, title, sub }) => (
                    <div key={title} className={`flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-gradient-to-br ${color} border ${border}`}>
                      <span className="text-3xl">{emoji}</span>
                      <span className="text-sm font-black text-gray-800">{title}</span>
                      <span className="text-xs text-gray-500 text-center leading-tight">{sub}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setStep(2)}
                  className="w-full py-4 px-8 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-lg font-black rounded-2xl transition-all shadow-lg shadow-indigo-200/60 hover:shadow-xl hover:shadow-indigo-300/60 hover:-translate-y-0.5 flex items-center justify-center gap-3"
                >
                  Let's Get Started <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* ── Step 2: Knowledge ── */}
            {step === 2 && (
              <div>
                <div className="flex items-start gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">Add your knowledge</h2>
                    <p className="text-sm text-gray-500 mt-1">Your agent uses this to answer customer questions accurately.</p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-1.5 bg-gray-50 rounded-2xl mb-6 border border-gray-100">
                  {([
                    ['file', '📄', 'Upload File'],
                    ['text', '✏️', 'Paste Text'],
                    ['qna',  '❓', 'Q & A'],
                  ] as [KnowledgeTab, string, string][]).map(([tab, icon, label]) => (
                    <button
                      key={tab}
                      onClick={() => setKbTab(tab)}
                      className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
                        kbTab === tab
                          ? 'bg-white text-indigo-600 shadow-md shadow-indigo-50 border border-indigo-100'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <span className="mr-1.5">{icon}</span>{label}
                    </button>
                  ))}
                </div>

                {kbTab === 'file' && (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
                      file
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50'
                    }`}
                  >
                    <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.txt,.docx,.md,.csv" />
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-indigo-700">{file.name}</p>
                          <p className="text-xs text-indigo-400">{(file.size / 1024).toFixed(1)} KB — ready to upload</p>
                        </div>
                        <CheckCircle className="w-6 h-6 text-emerald-500 ml-2" />
                      </div>
                    ) : (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-7 h-7 text-gray-400" />
                        </div>
                        <p className="text-base font-bold text-gray-600">Drop a file here or click to browse</p>
                        <p className="text-sm text-gray-400 mt-1">PDF · TXT · DOCX · Markdown · CSV</p>
                      </>
                    )}
                  </div>
                )}

                {kbTab === 'text' && (
                  <div className="relative">
                    <textarea
                      value={textContent}
                      onChange={e => setText(e.target.value)}
                      placeholder="Paste your product descriptions, FAQs, return policies, or anything your agent should know..."
                      className="w-full h-44 px-5 py-4 text-sm border-2 border-gray-100 rounded-2xl bg-gray-50 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-300 focus:bg-white resize-none font-medium transition-all"
                    />
                    {textContent && (
                      <span className="absolute bottom-3 right-4 text-xs text-gray-400">{textContent.length} chars</span>
                    )}
                  </div>
                )}

                {kbTab === 'qna' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-gray-600 uppercase tracking-widest mb-2">Question</label>
                      <input
                        value={qnaQ}
                        onChange={e => setQnaQ(e.target.value)}
                        placeholder="e.g. What is your return policy?"
                        className="w-full px-5 py-3.5 text-sm border-2 border-gray-100 rounded-2xl bg-gray-50 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-300 focus:bg-white font-medium transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-600 uppercase tracking-widest mb-2">Answer</label>
                      <textarea
                        value={qnaA}
                        onChange={e => setQnaA(e.target.value)}
                        placeholder="e.g. We offer 30-day hassle-free returns on all items..."
                        className="w-full h-32 px-5 py-4 text-sm border-2 border-gray-100 rounded-2xl bg-gray-50 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-300 focus:bg-white resize-none font-medium transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-7">
                  <button
                    onClick={() => setStep(3)}
                    disabled={uploading}
                    className="px-6 py-4 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors flex-shrink-0"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleKnowledgeNext}
                    disabled={uploading || !canNext}
                    className="flex-1 py-4 text-base font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-all shadow-lg shadow-blue-200/60 hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {uploading
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Uploading…</>
                      : <>Continue <ArrowRight className="w-5 h-5" /></>}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Agent ── */}
            {step === 3 && (
              <div>
                <div className="flex items-start gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-200">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">Your agent is ready ✨</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {loadingSuggestion ? 'AI is generating a suggestion based on your content…' : 'Review and hit create — you can always edit later.'}
                    </p>
                  </div>
                </div>

                {loadingSuggestion ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-5">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-indigo-500 animate-pulse" />
                      </div>
                      <div className="absolute inset-0 rounded-2xl bg-indigo-400/20 animate-ping" />
                    </div>
                    <p className="text-base font-bold text-gray-500">Crafting your agent suggestion…</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl">
                      <div className="flex items-start gap-4 mb-5">
                        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-indigo-100 flex items-center justify-center text-3xl flex-shrink-0">
                          {suggestion?.icon || '🤖'}
                        </div>
                        <div className="flex-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest mb-2">
                            <Sparkles className="w-3 h-3" /> AI Suggested
                          </span>
                          <p className="text-sm text-gray-600 leading-relaxed">{suggestion?.description || 'A smart support agent for your business.'}</p>
                        </div>
                      </div>
                      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Agent Name</label>
                      <input
                        value={agentName}
                        onChange={e => setAgentName(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-indigo-100 rounded-xl bg-white text-gray-900 font-bold focus:outline-none focus:border-indigo-400 transition-colors"
                      />

                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-black text-gray-500 uppercase tracking-widest">System Prompt</label>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600 text-[10px] font-black">
                            <Sparkles className="w-2.5 h-2.5" /> AI Written
                          </span>
                        </div>
                        <textarea
                          value={systemPrompt}
                          onChange={e => setSystemPrompt(e.target.value)}
                          rows={5}
                          placeholder="Describe how your agent should behave, its tone, and what it should help customers with…"
                          className="w-full px-4 py-3 text-sm border-2 border-indigo-100 rounded-xl bg-white text-gray-700 placeholder-indigo-200 focus:outline-none focus:border-indigo-400 resize-none leading-relaxed transition-colors font-medium"
                        />
                        <p className="text-[11px] text-indigo-400 mt-1.5 font-medium">✦ AI-generated — edit freely to match your brand voice</p>
                      </div>
                    </div>

                    {kbId && (
                      <div className="flex items-center gap-3 px-5 py-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-800">Knowledge base attached</p>
                          <p className="text-xs text-emerald-600">Your agent will answer using your content</p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleCreateAgent}
                      disabled={creatingAgent || !agentName.trim()}
                      className="w-full py-4 text-base font-black bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-all shadow-lg shadow-violet-200/60 hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3"
                    >
                      {creatingAgent
                        ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating Agent…</>
                        : <><Bot className="w-5 h-5" /> Create My Agent</>}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Go Live ── */}
            {step === 4 && (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 text-4xl mb-6 shadow-lg shadow-emerald-200">
                  🚀
                </div>
                <h2 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">You're live!</h2>
                <p className="text-base text-gray-500 mb-8 max-w-sm mx-auto leading-relaxed">
                  Your AI support agent is up and running. Share it with your customers right now.
                </p>

                <div className="space-y-4 text-left mb-8">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <ExternalLink className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Direct Chat Link</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-bold text-indigo-700 bg-white px-4 py-2.5 rounded-xl border border-indigo-100 truncate">
                        support247.chat/{spaceSlug}
                      </code>
                      <a
                        href={`https://support247.chat/${spaceSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-gray-700 flex items-center justify-center">
                        <Copy className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-xs font-black text-gray-600 uppercase tracking-widest">Embed on Your Website</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 text-xs text-gray-500 bg-gray-900 text-green-400 px-4 py-3 rounded-xl break-all font-mono leading-relaxed">
                        {embedCode}
                      </code>
                      <button
                        onClick={copyEmbed}
                        className={`p-2.5 rounded-xl border-2 transition-all flex-shrink-0 ${copied ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500 hover:text-gray-700'}`}
                      >
                        {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/app/dashboard')}
                  className="w-full py-4 text-base font-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-2xl transition-all shadow-lg shadow-emerald-200/60 hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3"
                >
                  Go to Dashboard <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Step pills */}
        <div className="flex justify-center gap-2 mt-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                step === i + 1 ? 'w-8 h-2.5 bg-indigo-600' :
                step > i + 1   ? 'w-2.5 h-2.5 bg-indigo-300' :
                                  'w-2.5 h-2.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
