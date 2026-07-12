import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Send, Trash2, Bot, User, Sparkles, MessageCircle, Zap, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../components/ui/cn'
import { ChatSkeleton } from '../components/ui/SkeletonLoader'
import { SourceCitation } from '../components/ui/SourceCitation'
import { useAppStore } from '../store/useAppStore'
import { apiClient } from '../api/client'
import { QUICK_ACTIONS } from '../config/api'
import { getAgentTheme, getSentimentColor, getSentimentLabel } from '../config/theme'
import type { Message } from '../types'

// ── Markdown + Math renderer ──────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => (
          <p className="text-[13.5px] leading-[1.75] mb-2.5 last:mb-0 text-gray-700 dark:text-gray-200">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-300">{children}</em>,

        h1: ({ children }) => (
          <h1 className="text-sm font-bold mt-4 mb-2 text-gray-900 dark:text-white flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-violet-600 flex-shrink-0" />
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[13px] font-semibold mt-3.5 mb-1.5 text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-indigo-400/70 dark:bg-indigo-500/70 flex-shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[12.5px] font-semibold mt-2.5 mb-1 text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">{children}</h3>
        ),

        ul: ({ children }) => (
          <ul className="my-2 space-y-1.5 pl-4 list-none
                         [&>li]:relative
                         [&>li]:before:absolute [&>li]:before:-left-3.5
                         [&>li]:before:top-[8px] [&>li]:before:w-1.5 [&>li]:before:h-1.5
                         [&>li]:before:rounded-full [&>li]:before:bg-indigo-400
                         dark:[&>li]:before:bg-indigo-500">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 space-y-1.5 pl-5 list-decimal marker:text-indigo-500 dark:marker:text-indigo-400 marker:font-semibold marker:text-[12px]">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-[13.5px] leading-[1.65] text-gray-700 dark:text-gray-200">{children}</li>
        ),

        code: ({ className, children }) => {
          if (className?.includes('language-')) {
            return <code className="block font-mono text-[12px] text-gray-100">{children}</code>
          }
          return (
            <code className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-md text-[12px] font-mono border border-indigo-100 dark:border-indigo-900/80 align-middle">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-3 p-4 bg-gray-950 dark:bg-black/60 text-gray-100 rounded-xl text-[12px] font-mono overflow-x-auto leading-relaxed border border-gray-800/80 shadow-inner">
            {children}
          </pre>
        ),

        blockquote: ({ children }) => (
          <blockquote className="my-2.5 pl-3.5 border-l-2 border-indigo-400 dark:border-indigo-500/70 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-r-lg py-1.5 text-gray-600 dark:text-gray-400 italic text-[13px]">
            {children}
          </blockquote>
        ),

        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
            <table className="w-full text-[12.5px] border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-indigo-50 dark:bg-indigo-950/40">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3.5 py-2.5 text-left text-[11.5px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide border-b border-gray-200 dark:border-white/10">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3.5 py-2 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-white/5 last:border-0">
            {children}
          </td>
        ),

        hr: () => <hr className="my-3 border-gray-200 dark:border-white/10" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 decoration-indigo-300 dark:decoration-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── Send button ───────────────────────────────────────────────────────────────
function SendButton({ onClick, disabled, loading }: { onClick: () => void; disabled: boolean; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150',
        'bg-gradient-to-br from-indigo-500 to-violet-600',
        'shadow-md shadow-indigo-500/30 dark:shadow-indigo-500/20',
        'hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-500/40 hover:scale-105',
        'active:scale-95',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md',
        'text-white',
      )}
    >
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        : <Send className="w-3.5 h-3.5" />
      }
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function Chat() {
  const { messages, conversationId, activeAgent, addMessage, setConversationId, setActiveAgent, clearChat, spaceId } = useAppStore()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setError(null)

    addMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: new Date() })
    setIsLoading(true)

    try {
      const data = await apiClient.sendMessage(trimmed, conversationId, spaceId || undefined)
      if (data.conversation_id) setConversationId(data.conversation_id)
      const agent = data.agent_used || data.agent || activeAgent
      setActiveAgent(agent)
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || data.message || 'No response received.',
        timestamp: new Date(),
        agent,
        sentimentScore: data.sentiment_score ?? data.empathy?.sentiment_score,
        sources: data.sources || data.rag_sources || [],
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect.'
      setError(errMsg)
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I encountered an error: ${errMsg}. Please check that the backend is running.`,
        timestamp: new Date(),
        agent: 'System',
      })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, conversationId, activeAgent, addMessage, setConversationId, setActiveAgent])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/80 dark:bg-transparent">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5
                      bg-white/80 dark:bg-black/20 backdrop-blur-sm
                      border-b border-gray-200/60 dark:border-white/8 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Pulsing online indicator */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[12px] text-gray-500 dark:text-gray-400 font-medium">
            Active:
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold
                           bg-gradient-to-r from-indigo-500/10 to-violet-500/10
                           dark:from-indigo-500/20 dark:to-violet-500/20
                           text-indigo-700 dark:text-indigo-300
                           border border-indigo-200/60 dark:border-indigo-500/30">
            {activeAgent}
          </span>
          {conversationId && (
            <span className="hidden sm:inline text-[11px] text-gray-400 dark:text-gray-600 font-mono">
              #{conversationId.slice(0, 6)}
            </span>
          )}
        </div>

        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 dark:text-gray-500
                     hover:text-red-500 dark:hover:text-red-400
                     px-2.5 py-1 rounded-lg
                     hover:bg-red-50 dark:hover:bg-red-500/10
                     transition-all duration-150 group"
        >
          <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          Clear
        </button>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-5 space-y-6">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12 select-none">
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-950">
                <Zap className="w-2.5 h-2.5 text-white" />
              </span>
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1.5">How can I help you today?</h3>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[260px] leading-relaxed mb-6">
              Ask about your policy, coverage, claims, or anything else.
            </p>
            {/* Suggested starters */}
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {['What is my policy coverage?', 'How do I file a claim?', 'Explain my premium amount'].map(q => (
                <button key={q} onClick={() => sendMessage(q)}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-[13px] font-medium
                             bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10
                             text-gray-700 dark:text-gray-300
                             hover:border-indigo-300 dark:hover:border-indigo-500/50
                             hover:bg-indigo-50 dark:hover:bg-indigo-500/10
                             hover:text-indigo-700 dark:hover:text-indigo-300
                             transition-all duration-150 shadow-sm">
                  <MessageCircle className="inline w-3.5 h-3.5 mr-2 opacity-50" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => {
          const isUser = msg.role === 'user'
          const agentTheme = msg.agent ? getAgentTheme(msg.agent) : null

          return (
            <div key={msg.id} className={cn('flex gap-3 animate-fadeIn', isUser && 'flex-row-reverse')}>

              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5',
                isUser
                  ? 'bg-gradient-to-br from-gray-400 to-gray-600 dark:from-gray-500 dark:to-gray-700 text-white'
                  : agentTheme
                    ? `${agentTheme.bg} text-white`
                    : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
              )}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={cn('flex flex-col gap-1 min-w-0 max-w-[84%] sm:max-w-[72%]', isUser && 'items-end')}>

                {/* Meta row */}
                <div className={cn('flex items-center gap-1.5 px-0.5', isUser && 'flex-row-reverse')}>
                  {!isUser && msg.agent && (
                    <span className={cn(
                      'text-[10.5px] font-semibold px-2 py-0.5 rounded-full',
                      agentTheme?.badge || 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300'
                    )}>
                      {msg.agent}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 dark:text-gray-600">
                    {format(new Date(msg.timestamp), 'HH:mm')}
                  </span>
                </div>

                {/* Bubble */}
                {isUser ? (
                  /* ── User bubble ── */
                  <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm
                                  bg-gradient-to-br from-indigo-500 to-violet-600
                                  text-white shadow-lg shadow-indigo-500/25 dark:shadow-indigo-500/20">
                    <p className="text-[13.5px] leading-[1.7] whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (
                  /* ── AI bubble ── */
                  <div className="rounded-2xl rounded-tl-sm overflow-hidden
                                  bg-white dark:bg-white/[0.04]
                                  border border-gray-200/80 dark:border-white/[0.08]
                                  shadow-sm dark:shadow-none">
                    {/* Gradient accent bar */}
                    <div className="h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 opacity-70" />
                    <div className="px-4 py-3.5">
                      <MessageContent content={msg.content} />
                    </div>
                  </div>
                )}

                {/* Sentiment bar */}
                {!isUser && msg.sentimentScore !== undefined && (
                  <div className="flex items-center gap-2 px-1 mt-0.5">
                    <div className="h-1 w-14 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', getSentimentColor(msg.sentimentScore))}
                        style={{ width: `${msg.sentimentScore * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{getSentimentLabel(msg.sentimentScore)}</span>
                  </div>
                )}

                {/* Sources */}
                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="px-1">
                    <SourceCitation sources={msg.sources} />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Loading */}
        {isLoading && (
          <div className="flex gap-3 animate-fadeIn">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="rounded-2xl rounded-tl-sm overflow-hidden bg-white dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/[0.08] shadow-sm">
              <div className="h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 opacity-70" />
              <div className="px-4 py-3.5">
                <ChatSkeleton />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-1 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-[12.5px] text-red-600 dark:text-red-400 shadow-sm">
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0 border-t border-gray-200/60 dark:border-white/8
                      bg-white/60 dark:bg-black/10 backdrop-blur-sm">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-none">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.message)}
              disabled={isLoading}
              className="flex-shrink-0 px-3.5 py-1.5 text-[11.5px] font-medium rounded-full
                         bg-white dark:bg-white/5
                         border border-gray-200 dark:border-white/10
                         text-gray-600 dark:text-gray-400
                         hover:bg-indigo-50 dark:hover:bg-indigo-500/15
                         hover:border-indigo-300 dark:hover:border-indigo-500/40
                         hover:text-indigo-700 dark:hover:text-indigo-300
                         active:scale-95 transition-all duration-150
                         shadow-sm disabled:opacity-40 disabled:cursor-not-allowed
                         whitespace-nowrap"
            >
              {action.label}
            </button>
          ))}
        </div>
        {/* Right fade for overflow hint */}
        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none
                        bg-gradient-to-l from-white/80 dark:from-black/20 to-transparent" />
      </div>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-2.5 flex-shrink-0
                      bg-white/80 dark:bg-black/10 backdrop-blur-sm">
        <div className="flex gap-2.5 items-end
                        bg-white dark:bg-white/5
                        border border-gray-200 dark:border-white/10
                        rounded-2xl px-4 py-3
                        focus-within:border-indigo-400 dark:focus-within:border-indigo-500/60
                        focus-within:ring-3 focus-within:ring-indigo-500/10
                        shadow-sm dark:shadow-none
                        transition-all duration-200">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent
                       text-[13.5px] text-gray-900 dark:text-gray-100
                       placeholder-gray-400 dark:placeholder-white/25
                       focus:outline-none leading-relaxed
                       max-h-[120px] overflow-y-auto"
          />
          <SendButton onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} loading={isLoading} />
        </div>
        <p className="text-[11px] text-gray-400/70 dark:text-white/20 mt-1.5 text-center tracking-wide">
          Support247 · Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
