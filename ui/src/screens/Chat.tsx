import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Send, Trash2, Bot, User, Sparkles, MessageCircle, Zap, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../components/ui/cn'
import { ChatSkeleton } from '../components/ui/SkeletonLoader'
import { SourceCitation } from '../components/ui/SourceCitation'
import { useAppStore } from '../store/useAppStore'
import { apiClient } from '../api/client'
import { QUICK_ACTIONS } from '../config/api'
import { getAgentTheme, getSentimentColor, getSentimentLabel } from '../config/theme'

// ── Markdown + Math renderer ──────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => (
          <p className="text-[14px] leading-relaxed mb-3 last:mb-0 text-gray-700 dark:text-gray-200">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-300">{children}</em>,
        h1: ({ children }) => (
          <h1 className="text-sm font-bold mt-5 mb-2.5 text-gray-900 dark:text-white flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-[color:var(--impeccable-accent)] flex-shrink-0" />
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[13.5px] font-semibold mt-4 mb-2 text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-[color:color-mix(in_srgb,var(--impeccable-accent)_70%,transparent)] flex-shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[12.5px] font-semibold mt-3 mb-1.5 text-[color:var(--impeccable-accent)] uppercase tracking-wide">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="my-2.5 space-y-2 pl-4 list-none
                         [&>li]:relative
                         [&>li]:before:absolute [&>li]:before:-left-4
                         [&>li]:before:top-[8px] [&>li]:before:w-1.5 [&>li]:before:h-1.5
                         [&>li]:before:rounded-full [&>li]:before:bg-[color:var(--impeccable-accent)]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2.5 space-y-2 pl-5 list-decimal marker:text-[color:var(--impeccable-accent)] marker:font-semibold">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-[14px] leading-relaxed text-gray-700 dark:text-gray-200">{children}</li>
        ),
        code: ({ className, children }) => {
          if (className?.includes('language-')) {
            return <code className="block font-mono text-[12.5px] text-gray-100">{children}</code>
          }
          return (
            <code className="px-1.5 py-0.5 bg-[color:color-mix(in_srgb,var(--impeccable-accent)_10%,transparent)] text-[color:var(--impeccable-accent)] rounded-md text-[12.5px] font-mono border border-[color:color-mix(in_srgb,var(--impeccable-accent)_20%,transparent)] align-middle">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-3 p-4 bg-gray-900 dark:bg-black/80 text-gray-100 rounded-xl text-[12.5px] font-mono overflow-x-auto leading-relaxed border border-gray-800 shadow-inner">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 pl-4 border-l-2 border-[color:var(--impeccable-accent)] bg-[color:color-mix(in_srgb,var(--impeccable-accent)_5%,transparent)] rounded-r-xl py-2 pr-3 text-gray-600 dark:text-gray-400 italic text-[13.5px]">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-[color:var(--impeccable-accent)] underline underline-offset-2 hover:opacity-80 transition-opacity">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <table className="w-full text-[13px] border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50 dark:bg-gray-900/50">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-800">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800/50 last:border-0">
            {children}
          </td>
        ),
        hr: () => <hr className="my-4 border-gray-200 dark:border-gray-800" />,
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
        'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ease-out',
        'bg-[color:var(--impeccable-accent)] text-white',
        'shadow-md shadow-[color:color-mix(in_srgb,var(--impeccable-accent)_30%,transparent)]',
        'hover:scale-105 active:scale-95 hover:shadow-lg',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md'
      )}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <Send className="w-3.5 h-3.5 ml-0.5" />
      )}
    </button>
  )
}

// ── Typing Indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <motion.div
        className="w-1.5 h-1.5 bg-[color:var(--impeccable-accent)] rounded-full"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
      />
      <motion.div
        className="w-1.5 h-1.5 bg-[color:var(--impeccable-accent)] rounded-full"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
      />
      <motion.div
        className="w-1.5 h-1.5 bg-[color:var(--impeccable-accent)] rounded-full"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
      />
    </div>
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
  }, [isLoading, conversationId, activeAgent, addMessage, setConversationId, setActiveAgent, spaceId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3
                      bg-white/40 dark:bg-black/10 backdrop-blur-xl
                      border-b border-gray-200/50 dark:border-white/5 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-[13px] text-gray-500 dark:text-gray-400 font-medium">
            Active:
          </span>
          <span className="px-3 py-1 rounded-full text-[12px] font-bold
                           bg-[color:color-mix(in_srgb,var(--impeccable-accent)_15%,transparent)]
                           text-[color:var(--impeccable-accent)]
                           border border-[color:color-mix(in_srgb,var(--impeccable-accent)_30%,transparent)] shadow-sm">
            {activeAgent}
          </span>
        </div>

        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 dark:text-gray-500
                     hover:text-red-500 dark:hover:text-red-400
                     px-3 py-1.5 rounded-full
                     hover:bg-red-50 dark:hover:bg-red-500/10 hover:shadow-sm
                     transition-all duration-300 ease-out group"
        >
          <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          Clear
        </button>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-10 py-6 space-y-8 scroll-smooth z-0">
        
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center h-full text-center px-4 py-12 select-none"
            >
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-3xl bg-[color:var(--impeccable-accent)] flex items-center justify-center shadow-2xl shadow-[color:color-mix(in_srgb,var(--impeccable-accent)_30%,transparent)]">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-950 shadow-md">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">How can I help you today?</h3>
              <p className="text-[14px] text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed mb-8">
                Ask about your policy, coverage, claims, or anything else you need help with.
              </p>
              {/* Suggested starters */}
              <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 w-full max-w-2xl">
                {['What is my policy coverage?', 'How do I file a claim?', 'Explain my premium amount'].map((q, i) => (
                  <motion.button 
                    key={q} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 25 }}
                    onClick={() => sendMessage(q)}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[13.5px] font-semibold
                               bg-white/70 dark:bg-gray-900/50 backdrop-blur-md
                               border border-gray-200 dark:border-gray-800
                               text-gray-700 dark:text-gray-200
                               hover:border-[color:var(--impeccable-accent)] dark:hover:border-[color:var(--impeccable-accent)]
                               hover:bg-[color:color-mix(in_srgb,var(--impeccable-accent)_5%,transparent)]
                               hover:text-[color:var(--impeccable-accent)] dark:hover:text-[color:var(--impeccable-accent)]
                               hover:shadow-md hover:-translate-y-0.5
                               transition-all duration-300 ease-out"
                  >
                    <MessageCircle className="w-4 h-4 opacity-70" />
                    {q}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg, i) => {
            const isUser = msg.role === 'user'
            const agentTheme = msg.agent ? getAgentTheme(msg.agent) : null

            return (
              <motion.div 
                key={msg.id} 
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={cn('flex gap-4 w-full', isUser && 'flex-row-reverse')}
              >
                {/* Avatar */}
                <div className={cn(
                  'w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md mt-1',
                  isUser
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                    : 'bg-[color:var(--impeccable-accent)] text-white shadow-[color:color-mix(in_srgb,var(--impeccable-accent)_30%,transparent)]'
                )}>
                  {isUser ? <User className="w-4.5 h-4.5" /> : <Bot className="w-4.5 h-4.5" />}
                </div>

                <div className={cn('flex flex-col gap-1.5 min-w-0 max-w-[85%] md:max-w-[75%]', isUser && 'items-end')}>
                  {/* Meta row */}
                  <div className={cn('flex items-center gap-2 px-1', isUser && 'flex-row-reverse')}>
                    {!isUser && msg.agent && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        {msg.agent}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      {format(new Date(msg.timestamp), 'HH:mm')}
                    </span>
                  </div>

                  {/* Bubble */}
                  {isUser ? (
                    /* ── User bubble (Glass Accent) ── */
                    <div className="px-5 py-3 rounded-3xl rounded-tr-sm
                                    bg-[color:var(--impeccable-accent)]
                                    text-white shadow-lg shadow-[color:color-mix(in_srgb,var(--impeccable-accent)_20%,transparent)]
                                    border border-white/10 dark:border-white/5 backdrop-blur-md">
                      <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    /* ── AI bubble (Glass Light/Dark) ── */
                    <div className="rounded-3xl rounded-tl-sm overflow-hidden
                                    bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl
                                    border border-gray-200/80 dark:border-gray-800/80
                                    shadow-sm">
                      {/* Top accent bar */}
                      <div className="h-[3px] w-full bg-gradient-to-r from-[color:var(--impeccable-accent)] to-[color:color-mix(in_srgb,var(--impeccable-accent)_50%,transparent)] opacity-80" />
                      <div className="px-5 py-4">
                        <MessageContent content={msg.content} />
                      </div>
                    </div>
                  )}

                  {/* Sentiment & Sources */}
                  <div className={cn("flex flex-col gap-2 mt-1", isUser && "items-end")}>
                    {!isUser && msg.sentimentScore !== undefined && (
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', getSentimentColor(msg.sentimentScore))}
                            style={{ width: `${msg.sentimentScore * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{getSentimentLabel(msg.sentimentScore)}</span>
                      </div>
                    )}

                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="pt-1">
                        <SourceCitation sources={msg.sources} />
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            )
          })}

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="flex gap-4 w-full"
            >
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md mt-1 bg-[color:var(--impeccable-accent)] text-white shadow-[color:color-mix(in_srgb,var(--impeccable-accent)_30%,transparent)]">
                <Bot className="w-4.5 h-4.5" />
              </div>
              <div className="rounded-3xl rounded-tl-sm overflow-hidden bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200/80 dark:border-gray-800/80 shadow-sm px-5 py-4 flex items-center">
                <TypingIndicator />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-lg px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-[13px] font-medium text-red-600 dark:text-red-400 shadow-sm flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" /> {error}
          </motion.div>
        )}

        <div ref={bottomRef} className="h-4" />
      </div>

      {/* ── Quick actions & Input Area ───────────────────────────────────── */}
      <div className="relative flex-shrink-0 z-20">
        <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-gray-50/80 dark:from-black/80 to-transparent pointer-events-none" />
        
        <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-t border-gray-200/60 dark:border-white/10 pb-4 pt-2">
          
          <div className="flex gap-2 overflow-x-auto px-6 py-2 scrollbar-none">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.message)}
                disabled={isLoading}
                className="flex-shrink-0 px-4 py-2 text-[12px] font-bold rounded-full
                           bg-white dark:bg-gray-800
                           border border-gray-200 dark:border-gray-700
                           text-gray-700 dark:text-gray-300
                           hover:border-[color:var(--impeccable-accent)] hover:text-[color:var(--impeccable-accent)]
                           active:scale-95 transition-all duration-300 ease-out
                           shadow-sm disabled:opacity-40 disabled:cursor-not-allowed
                           whitespace-nowrap"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="px-4 sm:px-6 md:px-10 mt-2">
            <div className="flex gap-3 items-end
                            bg-white dark:bg-gray-900
                            border border-gray-200 dark:border-gray-800
                            rounded-3xl pl-5 pr-2 py-2
                            focus-within:border-[color:var(--impeccable-accent)] dark:focus-within:border-[color:var(--impeccable-accent)]
                            focus-within:ring-4 focus-within:ring-[color:color-mix(in_srgb,var(--impeccable-accent)_15%,transparent)]
                            shadow-lg shadow-gray-200/50 dark:shadow-none
                            transition-all duration-300 ease-out">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoResize() }}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or type a command..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none bg-transparent py-2.5
                           text-[14.5px] text-gray-900 dark:text-gray-100 font-medium
                           placeholder-gray-400 dark:placeholder-gray-500
                           focus:outline-none leading-relaxed
                           max-h-[120px] overflow-y-auto"
              />
              <div className="pb-1 pr-1">
                <SendButton onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} loading={isLoading} />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 text-center tracking-wide font-medium">
              Powered by Support247 · Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
