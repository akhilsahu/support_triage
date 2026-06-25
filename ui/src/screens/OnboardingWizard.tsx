import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Upload, FileText, CheckCircle, ArrowRight, Loader2, Sparkles, X, Copy, ExternalLink, Bot, BookOpen, Globe, Database, Cpu, Link } from 'lucide-react'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import gemLogo from '../assets/images/logos/gem.jpg'

type KnowledgeTab = 'file' | 'text' | 'qna'
interface Suggestion { name: string; description: string; agent_type: string; system_prompt: string; icon?: string }

const STEPS = [
  { label: 'Welcome',   num: 1 },
  { label: 'Knowledge', num: 2 },
  { label: 'Agent',     num: 3 },
  { label: 'Go Live',   num: 4 },
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

  const [suggestion, setSuggestion]         = useState<Suggestion | null>(null)
  const [agentName, setAgentName]           = useState('')
  const [systemPrompt, setSystemPrompt]     = useState('')
  const [loadingSuggestion, setLoadingSugg] = useState(false)
  const [creatingAgent, setCreatingAgent]   = useState(false)
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
    }
    finally { setLoadingSugg(false) }
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-10 px-4">

      {/* Top bar */}
      <div className="w-full max-w-xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          {isQuick && (
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <img src={gemLogo} alt="Support247" className="h-7 w-7 rounded-lg object-cover" />
          <span className="text-sm font-semibold text-gray-700">Support247</span>
        </div>

        {step < 4 && (
          <button
            onClick={skipAll}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip setup
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const done   = step > i + 1
            const active = step === i + 1
            return (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border transition-all
                    ${done   ? 'bg-indigo-600 border-indigo-600 text-white' :
                      active ? 'bg-white border-indigo-600 text-indigo-600' :
                               'bg-white border-gray-200 text-gray-300'}`}
                  >
                    {done ? <CheckCircle className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium ${active ? 'text-gray-700' : done ? 'text-indigo-500' : 'text-gray-300'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-2 mb-5 bg-gray-200 relative top-0">
                    <div className={`h-full bg-indigo-500 transition-all duration-300 ${done ? 'w-full' : 'w-0'}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-8">

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-7">
                <img src={gemLogo} alt="" className="w-10 h-10 rounded-xl object-cover" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Welcome, {spaceName}</h1>
                  <p className="text-sm text-gray-500">Let's get your AI support agent set up.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { icon: Database,  title: 'Add Knowledge',   sub: 'Upload your docs or FAQs' },
                  { icon: Cpu,       title: 'Configure Agent', sub: 'We pre-fill everything'    },
                  { icon: Globe,     title: 'Go Live',         sub: 'Share a link or embed it'  },
                ].map(({ icon: Icon, title, sub }) => (
                  <div key={title} className="flex flex-col gap-2 p-4 rounded-xl border border-gray-100 bg-gray-50">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-indigo-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-800">{title}</p>
                    <p className="text-xs text-gray-400 leading-snug">{sub}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Knowledge */}
          {step === 2 && (
            <div>
              <div className="mb-7">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Add your knowledge base</h2>
                <p className="text-sm text-gray-500">Your agent will use this content to answer customer questions.</p>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
                {([
                  ['file', Upload,    'Upload File'],
                  ['text', FileText,  'Paste Text'],
                  ['qna',  BookOpen,  'Q & A'],
                ] as [KnowledgeTab, React.ElementType, string][]).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    onClick={() => setKbTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                      kbTab === tab
                        ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {kbTab === 'file' && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    file ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                  }`}
                >
                  <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.txt,.docx,.md,.csv" />
                  {file ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-800">{file.name}</p>
                        <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-emerald-500 ml-1" />
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mx-auto mb-3">
                        <Upload className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600">Click to upload or drag and drop</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, TXT, DOCX, Markdown, CSV</p>
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
                    className="w-full h-40 px-4 py-3 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-400 focus:bg-white resize-none transition-colors"
                  />
                  {textContent && (
                    <span className="absolute bottom-3 right-3 text-xs text-gray-400">{textContent.length} chars</span>
                  )}
                </div>
              )}

              {kbTab === 'qna' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Question</label>
                    <input
                      value={qnaQ}
                      onChange={e => setQnaQ(e.target.value)}
                      placeholder="e.g. What is your return policy?"
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Answer</label>
                    <textarea
                      value={qnaA}
                      onChange={e => setQnaA(e.target.value)}
                      placeholder="e.g. We offer 30-day hassle-free returns on all items..."
                      className="w-full h-28 px-4 py-3 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-indigo-400 focus:bg-white resize-none transition-colors"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(3)}
                  disabled={uploading}
                  className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleKnowledgeNext}
                  disabled={uploading || !canNext}
                  className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {uploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Agent */}
          {step === 3 && (
            <div>
              <div className="mb-7">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Configure your agent</h2>
                <p className="text-sm text-gray-500">
                  {loadingSuggestion ? 'Generating a suggestion from your content…' : 'Review and edit before creating.'}
                </p>
              </div>

              {loadingSuggestion ? (
                <div className="flex flex-col items-center justify-center py-14 gap-4">
                  <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  </div>
                  <p className="text-sm text-gray-500">Building suggestion from your knowledge base…</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {suggestion?.description && (
                    <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 leading-relaxed">
                      {suggestion.description}
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Agent Name</label>
                    <input
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:border-indigo-400 transition-colors"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-600">System Prompt</label>
                      <span className="text-[11px] text-indigo-500 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI suggested
                      </span>
                    </div>
                    <textarea
                      value={systemPrompt}
                      onChange={e => setSystemPrompt(e.target.value)}
                      rows={8}
                      placeholder="Describe how your agent should behave, its tone, and what it should help customers with…"
                      className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 placeholder-gray-300 focus:outline-none focus:border-indigo-400 focus:bg-white resize-none leading-relaxed transition-colors"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">Edit freely — this is a starting point.</p>
                  </div>

                  {kbId && (
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-700 font-medium">Knowledge base attached</p>
                    </div>
                  )}

                  <button
                    onClick={handleCreateAgent}
                    disabled={creatingAgent || !agentName.trim()}
                    className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {creatingAgent
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                      : <><Bot className="w-4 h-4" /> Create Agent</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Go Live */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Your agent is live</h2>
                  <p className="text-sm text-gray-500">Share it with customers or embed it on your website.</p>
                </div>
              </div>

              <div className="space-y-4 mb-7">
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Link className="w-4 h-4 text-gray-400" />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Direct link</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg truncate">
                      support247.chat/{spaceSlug}
                    </code>
                    <a
                      href={`https://support247.chat/${spaceSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Copy className="w-4 h-4 text-gray-400" />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Embed snippet</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 text-xs font-mono text-green-400 bg-gray-900 px-3 py-2.5 rounded-lg break-all leading-relaxed">
                      {embedCode}
                    </code>
                    <button
                      onClick={copyEmbed}
                      className={`p-2 rounded-lg border transition-colors flex-shrink-0 ${
                        copied
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                          : 'border-gray-200 hover:border-gray-300 text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate('/app/dashboard')}
                className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Go to dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
