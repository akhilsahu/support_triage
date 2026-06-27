import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Bot, User } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../components/ui/cn'
import { Button } from '../components/ui/Button'
import { ChatSkeleton } from '../components/ui/SkeletonLoader'
import { SourceCitation } from '../components/ui/SourceCitation'
import { useAppStore } from '../store/useAppStore'
import { apiClient } from '../api/client'
import { QUICK_ACTIONS } from '../config/api'
import { getAgentTheme, getSentimentColor, getSentimentLabel } from '../config/theme'
import type { Message } from '../types'

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCode = false
  let codeLines: string[] = []
  let keyCounter = 0

  const processInline = (line: string, key: string): React.ReactNode => {
    // Bold
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
          if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">{part.slice(1, -1)}</code>
          return part
        })}
      </span>
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    keyCounter++
    const k = String(keyCounter)

    if (line.startsWith('```')) {
      if (!inCode) { inCode = true; codeLines = [] }
      else {
        inCode = false
        elements.push(
          <pre key={k} className="my-2 p-3 bg-gray-100 dark:bg-gray-700/80 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {codeLines.join('\n')}
          </pre>
        )
      }
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    if (line.startsWith('# ')) {
      elements.push(<h3 key={k} className="text-sm font-bold mt-2 mb-1 text-gray-900 dark:text-white">{line.slice(2)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h4 key={k} className="text-sm font-semibold mt-2 mb-1 text-gray-800 dark:text-gray-100">{line.slice(3)}</h4>)
    } else if (line.match(/^[-*] /)) {
      elements.push(
        <li key={k} className="flex gap-1.5 text-sm">
          <span className="text-indigo-500 mt-1 flex-shrink-0">•</span>
          <span>{processInline(line.slice(2), k + 'i')}</span>
        </li>
      )
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      elements.push(
        <li key={k} className="flex gap-1.5 text-sm">
          <span className="text-indigo-500 font-medium flex-shrink-0">{num}.</span>
          <span>{processInline(line.replace(/^\d+\. /, ''), k + 'i')}</span>
        </li>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={k} className="h-1" />)
    } else {
      elements.push(<p key={k} className="text-sm leading-relaxed">{processInline(line, k + 'i')}</p>)
    }
  }

  return <div className="space-y-0.5">{elements}</div>
}

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

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }
    addMessage(userMsg)
    setIsLoading(true)

    try {
      const data = await apiClient.sendMessage(trimmed, conversationId, spaceId || undefined)
      if (data.conversation_id) setConversationId(data.conversation_id)

      const agent = data.agent_used || data.agent || activeAgent
      setActiveAgent(agent)

      const sources = data.sources || data.rag_sources || []
      const sentimentScore = data.sentiment_score ?? data.empathy?.sentiment_score

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || data.message || 'No response received.',
        timestamp: new Date(),
        agent,
        sentimentScore,
        sources,
      }
      addMessage(assistantMsg)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to backend.'
      setError(errMsg)
      const errResponse: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errMsg}. Please ensure the backend is running.`,
        timestamp: new Date(),
        agent: 'System',
      }
      addMessage(errResponse)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, conversationId, activeAgent, addMessage, setConversationId, setActiveAgent])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
            Active: <span className="text-indigo-600 dark:text-indigo-400">{activeAgent}</span>
          </span>
          {conversationId && (
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              · ID: {conversationId.slice(0, 8)}…
            </span>
          )}
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Start a conversation</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              Ask about orders, shipping, refunds, or technical support. Our AI agents are ready to help.
            </p>
          </div>
        )}

        {messages.map(msg => {
          const isUser = msg.role === 'user'
          const agentTheme = msg.agent ? getAgentTheme(msg.agent) : null

          return (
            <div key={msg.id} className={cn('flex gap-3 animate-fadeIn', isUser && 'flex-row-reverse')}>
              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-medium',
                isUser ? 'bg-gray-600' : (agentTheme?.bg || 'bg-indigo-500')
              )}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Bubble */}
              <div className={cn('max-w-[80%] sm:max-w-[70%]', isUser && 'items-end flex flex-col')}>
                {/* Meta row */}
                <div className={cn('flex items-center gap-2 mb-1', isUser && 'flex-row-reverse')}>
                  {!isUser && msg.agent && (
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', agentTheme?.badge || 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300')}>
                      {msg.agent}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {format(new Date(msg.timestamp), 'HH:mm')}
                  </span>
                </div>

                {/* Content */}
                <div className={cn(
                  'px-4 py-3 rounded-2xl text-sm',
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-tl-sm shadow-sm'
                )}>
                  {isUser ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    renderMarkdown(msg.content)
                  )}
                </div>

                {/* Sentiment bar */}
                {!isUser && msg.sentimentScore !== undefined && (
                  <div className="mt-1.5 flex items-center gap-2 px-1">
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className={cn('h-full rounded-full transition-all', getSentimentColor(msg.sentimentScore))}
                        style={{ width: `${msg.sentimentScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{getSentimentLabel(msg.sentimentScore)}</span>
                  </div>
                )}

                {/* Sources */}
                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="px-1 mt-1">
                    <SourceCitation sources={msg.sources} />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div className="animate-fadeIn">
            <ChatSkeleton />
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0 border-t border-gray-100 dark:border-gray-800">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.label}
            onClick={() => sendMessage(action.message)}
            disabled={isLoading}
            className="flex-shrink-0 px-3 py-1.5 text-xs rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0">
        <div className="flex gap-2 items-end bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm px-3 py-2 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none leading-relaxed max-h-[120px] overflow-y-auto"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            loading={isLoading}
            size="sm"
            className="flex-shrink-0 h-8 w-8 p-0 rounded-lg"
          >
            {!isLoading && <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 text-center">
          Powered by SUPPORT247.chat multi-agent system
        </p>
      </div>
    </div>
  )
}
