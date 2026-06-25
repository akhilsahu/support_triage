import { useState, useRef } from 'react'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Upload, FileText, CheckCircle, ArrowRight, Loader2, Sparkles, X, Copy, ExternalLink } from 'lucide-react'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'

type KnowledgeTab = 'file' | 'text' | 'qna'

interface Suggestion {
  name: string
  description: string
  agent_type: string
  system_prompt: string
  icon?: string
}

export function OnboardingWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isQuick = searchParams.get('quick') === 'true'

  const { token, orgSlug, orgName, setOnboardingComplete } = useAppStore()
  if (!token) return <Navigate to="/app/login" replace />

  // Step: 1=welcome, 2=knowledge, 3=agent, 4=live
  const [step, setStep] = useState(isQuick ? 2 : 1)

  // Step 2 state
  const [kbTab, setKbTab] = useState<KnowledgeTab>('file')
  const [file, setFile] = useState<File | null>(null)
  const [textContent, setTextContent] = useState('')
  const [qnaQ, setQnaQ] = useState('')
  const [qnaA, setQnaA] = useState('')
  const [uploading, setUploading] = useState(false)
  const [kbId, setKbId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 3 state
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [agentName, setAgentName] = useState('')
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [creatingAgent, setCreatingAgent] = useState(false)

  // Step 4 state
  const [copied, setCopied] = useState(false)
  const embedCode = `<script src="https://api.support247.chat/api/v1/widget/embed.js" data-space="${orgSlug}" defer></script>`

  const progress = ((step - 1) / 3) * 100

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
  }

  const handleKnowledgeNext = async () => {
    setUploading(true)
    try {
      let createdKbId = ''

      if (kbTab === 'file' && file) {
        const kb = await apiClient.createKB({ name: `${orgName} Knowledge Base` })
        createdKbId = kb.id
        const doc = await apiClient.uploadDoc(file, undefined, 'general', kb.name)
        await apiClient.addKBItem(createdKbId, { item_type: 'doc', title: file.name, doc_id: doc.doc_id || doc.id })
      } else if (kbTab === 'text' && textContent.trim()) {
        const kb = await apiClient.createKB({ name: `${orgName} Knowledge Base` })
        createdKbId = kb.id
        await apiClient.addKBItem(createdKbId, { item_type: 'text', title: 'My knowledge', content: textContent.trim() })
      } else if (kbTab === 'qna' && qnaQ.trim() && qnaA.trim()) {
        const kb = await apiClient.createKB({ name: `${orgName} Knowledge Base` })
        createdKbId = kb.id
        await apiClient.addKBItem(createdKbId, { item_type: 'qna', question: qnaQ.trim(), content: qnaA.trim() })
      }

      setKbId(createdKbId)

      // Fetch AI suggestion
      setStep(3)
      setLoadingSuggestion(true)
      try {
        const result = await apiClient.getAgentSuggestion(
          createdKbId ? { kb_ids: [createdKbId] } : { agent_name: orgName }
        )
        setSuggestion(result)
        setAgentName(result.name || `${orgName} Support Agent`)
      } catch {
        setAgentName(`${orgName} Support Agent`)
      } finally {
        setLoadingSuggestion(false)
      }
    } catch (err) {
      console.error('Knowledge setup failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleSkipKnowledge = async () => {
    setStep(3)
    setLoadingSuggestion(true)
    try {
      const result = await apiClient.getAgentSuggestion({ agent_name: orgName })
      setSuggestion(result)
      setAgentName(result.name || `${orgName} Support Agent`)
    } catch {
      setAgentName(`${orgName} Support Agent`)
    } finally {
      setLoadingSuggestion(false)
    }
  }

  const handleCreateAgent = async () => {
    setCreatingAgent(true)
    try {
      await apiClient.createOrgAgent({
        name: agentName.trim() || suggestion?.name || `${orgName} Agent`,
        description: suggestion?.description || '',
        icon: suggestion?.icon || '🤖',
        system_prompt: suggestion?.system_prompt || '',
        rag_enabled: !!kbId,
        kb_ids: kbId ? [kbId] : [],
      })
      await apiClient.markOnboardingComplete()
      setOnboardingComplete(true)
      setStep(4)
    } catch (err) {
      console.error('Agent creation failed:', err)
    } finally {
      setCreatingAgent(false)
    }
  }

  const handleFinish = () => navigate('/app/dashboard')

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-xl mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {isQuick ? 'Quick Create' : 'Setup Wizard'}
          </span>
          {isQuick && (
            <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          {['Welcome', 'Knowledge', 'Agent', 'Go Live'].map((label, i) => (
            <span key={label} className={`text-[10px] font-medium ${step >= i + 1 ? 'text-indigo-500' : 'text-gray-400'}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-8">

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome, {orgName}!</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm leading-relaxed">
              Let's get your AI support agent live in 3 quick steps.<br />
              No technical knowledge required.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { icon: '📚', label: 'Add your knowledge' },
                { icon: '🤖', label: 'AI creates your agent' },
                { icon: '🚀', label: 'Share with customers' },
              ].map(({ icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 text-center">{label}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={async () => {
                await apiClient.markOnboardingComplete().catch(() => {})
                setOnboardingComplete(true)
                navigate('/app/dashboard')
              }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              Skip setup, go to dashboard →
            </button>
          </div>
        )}

        {/* ── Step 2: Add Knowledge ── */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Add your knowledge</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Your agent will use this to answer customer questions.</p>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
              {([['file', '📄 Upload File'], ['text', '✏️ Paste Text'], ['qna', '❓ Q&A']] as [KnowledgeTab, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setKbTab(tab)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${kbTab === tab ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {kbTab === 'file' && (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
              >
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.txt,.docx,.md,.csv" />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-5 h-5" />
                    <span className="text-sm font-medium">{file.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Click to upload a file</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, TXT, DOCX, MD, CSV</p>
                  </>
                )}
              </div>
            )}

            {kbTab === 'text' && (
              <textarea
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Paste your product info, FAQs, policies, or any text your agent should know..."
                className="w-full h-40 px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            )}

            {kbTab === 'qna' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Question</label>
                  <input
                    value={qnaQ}
                    onChange={e => setQnaQ(e.target.value)}
                    placeholder="e.g. What is your return policy?"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Answer</label>
                  <textarea
                    value={qnaA}
                    onChange={e => setQnaA(e.target.value)}
                    placeholder="e.g. We offer 30-day returns on all items..."
                    className="w-full h-28 px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSkipKnowledge}
                disabled={uploading}
                className="flex-1 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={handleKnowledgeNext}
                disabled={uploading || (kbTab === 'file' && !file) || (kbTab === 'text' && !textContent.trim()) || (kbTab === 'qna' && (!qnaQ.trim() || !qnaA.trim()))}
                className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <>Next <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Create Agent ── */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Your AI agent is ready</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {loadingSuggestion ? 'AI is analysing your content…' : 'Review and create your agent.'}
            </p>

            {loadingSuggestion ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Sparkles className="w-8 h-8 text-indigo-500 animate-pulse" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Generating agent suggestion…</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{suggestion?.icon || '🤖'}</span>
                    <div>
                      <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">AI Suggested</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{suggestion?.description || 'General support agent'}</p>
                    </div>
                  </div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Agent Name</label>
                  <input
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {kbId && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Knowledge base attached — agent will use your content
                  </div>
                )}

                <button
                  onClick={handleCreateAgent}
                  disabled={creatingAgent || !agentName.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {creatingAgent ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <>Create Agent <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Go Live ── */}
        {step === 4 && (
          <div className="text-center">
            <div className="text-5xl mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">You're live!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
              Your AI support agent is ready. Share it with your customers.
            </p>

            <div className="space-y-3 text-left mb-8">
              {/* Share link */}
              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Direct Chat Link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-900 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 truncate">
                    https://support247.chat/{orgSlug}
                  </code>
                  <a
                    href={`https://support247.chat/${orgSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Embed code */}
              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Embed on Your Website</p>
                <div className="flex items-start gap-2">
                  <code className="flex-1 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 break-all">
                    {embedCode}
                  </code>
                  <button
                    onClick={copyEmbed}
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 flex-shrink-0"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Step indicator dots */}
      <div className="flex gap-2 mt-6">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step >= s ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
        ))}
      </div>
    </div>
  )
}
