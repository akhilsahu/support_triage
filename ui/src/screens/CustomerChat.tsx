import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Send, Plus, Sun, Moon, Waves } from 'lucide-react'
import { SourceCitation } from '../components/ui/SourceCitation'
import type { SourceItem } from '../types'

// ── Theme definitions ─────────────────────────────────────────────────────────

type ThemeKey = 'dark' | 'blue' | 'light'

const THEMES: Record<ThemeKey, {
  bg: string
  bgMsg: string
  text: string
  subtext: string
  inputBg: string
  inputBorder: string
  inputText: string
  userBubble: string
  aiBubble: string
  aiText: string
  chipBg: string
  chipBorder: string
  chipText: string
  chipHover: string
  headerBg: string
  icon: string
}> = {
  dark: {
    bg:          'bg-[#0f0f0f]',
    bgMsg:       'bg-[#0f0f0f]',
    text:        'text-white',
    subtext:     'text-gray-400',
    inputBg:     'bg-[#1e1e1e]',
    inputBorder: 'border-[#333]',
    inputText:   'text-white placeholder-gray-500',
    userBubble:  'bg-[#2a2a2a] text-white',
    aiBubble:    'bg-[#1e1e1e] text-gray-100',
    aiText:      'text-gray-100',
    chipBg:      'bg-[#1a1a1a]',
    chipBorder:  'border-[#2f2f2f]',
    chipText:    'text-gray-300',
    chipHover:   'hover:bg-[#252525] hover:border-[#444]',
    headerBg:    'bg-[#0f0f0f]/80',
    icon:        'text-gray-400 hover:text-white',
  },
  blue: {
    bg:          'bg-gradient-to-b from-[#080818] via-[#0b1535] to-[#0d1b3e]',
    bgMsg:       'bg-[#080c1f]',
    text:        'text-white',
    subtext:     'text-blue-200/60',
    inputBg:     'bg-white/8 backdrop-blur-xl',
    inputBorder: 'border-white/15',
    inputText:   'text-white placeholder-blue-200/40',
    userBubble:  'bg-blue-600/80 text-white',
    aiBubble:    'bg-white/8 text-blue-50',
    aiText:      'text-blue-50',
    chipBg:      'bg-white/6',
    chipBorder:  'border-white/12',
    chipText:    'text-blue-100/80',
    chipHover:   'hover:bg-white/10 hover:border-white/20',
    headerBg:    'bg-transparent',
    icon:        'text-blue-200/60 hover:text-white',
  },
  light: {
    bg:          'bg-gray-50',
    bgMsg:       'bg-gray-50',
    text:        'text-gray-900',
    subtext:     'text-gray-600',
    inputBg:     'bg-white',
    inputBorder: 'border-gray-300',
    inputText:   'text-gray-900 placeholder-gray-500',
    userBubble:  'text-white',
    aiBubble:    'bg-white text-gray-900 shadow-sm border border-gray-200',
    aiText:      'text-gray-900',
    chipBg:      'bg-white',
    chipBorder:  'border-gray-300',
    chipText:    'text-gray-700',
    chipHover:   'hover:bg-gray-50 hover:border-gray-400',
    headerBg:    'bg-white border-b border-gray-200',
    icon:        'text-gray-500 hover:text-gray-800',
  },
}

const THEME_ORDER: ThemeKey[] = ['dark', 'blue', 'light']
const THEME_ICON: Record<ThemeKey, typeof Moon> = { dark: Moon, blue: Waves, light: Sun }
const THEME_NEXT: Record<ThemeKey, ThemeKey>    = { dark: 'blue', blue: 'light', light: 'dark' }

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownMessage({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []

  const flushList = (key: string) => {
    if (listItems.length === 0) return
    const captured = [...listItems]
    elements.push(
      <ol key={key} className="space-y-3 my-3 pl-1">
        {captured.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="font-semibold flex-shrink-0 opacity-60 mt-0.5">{i + 1}.</span>
            <span className="leading-[1.85]"><InlineMarkdown text={item} /></span>
          </li>
        ))}
      </ol>
    )
    listItems = []
  }

  lines.forEach((line, i) => {
    const listMatch = line.match(/^\s*\d+[.)]\s+(.*)/)
    if (listMatch) { listItems.push(listMatch[1]); return }

    if (line.trim() === '') {
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '')
      if (nextNonEmpty && /^\s*\d+[.)]\s+/.test(nextNonEmpty)) return
    }

    flushList(`list-${i}`)
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-3" />)
    } else {
      elements.push(<p key={i} className="leading-[1.85]"><InlineMarkdown text={line} /></p>)
    }
  })
  flushList('list-end')
  return <div className="space-y-2 text-[15px]">{elements}</div>
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}>{part.slice(1, -1)}</em>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'ai'
  text: string
  agent?: string
  citations?: SourceItem[]
}

interface OrgInfo {
  name: string
  logo_url?: string
  theme_color?: string
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomerChat() {
  const { slug }                        = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const chatParam                       = searchParams.get('chat')

  const [org, setOrg]               = useState<OrgInfo | null>(null)
  const [messages, setMessages]     = useState<Message[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([
    'How can I track my order?',
    'What is your return policy?',
    'I need help with my account',
    'How do I contact support?',
  ])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [restoring, setRestoring]   = useState(!!chatParam)
  const [sessionId, setSessionId]   = useState(() => chatParam || crypto.randomUUID())
  const [theme, setTheme]           = useState<ThemeKey>(() => {
    return (localStorage.getItem('chat-theme') as ThemeKey) || 'blue'
  })

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const t          = THEMES[theme]
  const accentColor = org?.theme_color || '#6366f1'

  // Cycle theme
  const cycleTheme = () => {
    const next = THEME_NEXT[theme]
    setTheme(next)
    localStorage.setItem('chat-theme', next)
  }

  // Fetch org branding
  useEffect(() => {
    if (!slug) return
    fetch(`/api/v1/org/public/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setOrg(data); else setOrg({ name: slug }) })
      .catch(() => setOrg({ name: slug }))
  }, [slug])

  // Fetch suggestions
  useEffect(() => {
    if (!slug) return
    fetch(`/api/chat/${slug}/suggestions`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.suggestions) setSuggestions(data.suggestions) })
      .catch(() => {})
  }, [slug])

  // Restore session
  useEffect(() => {
    if (!chatParam || !slug) return
    setRestoring(true)
    fetch(`/api/chat/${slug}/session/${chatParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.history?.length) return
        setMessages(data.history.map((h: any) => ({
          id:    crypto.randomUUID(),
          role:  h.role === 'user' ? 'user' : 'ai',
          text:  h.message,
          agent: h.agent_slug ?? undefined,
        })))
        setSessionId(chatParam)
      })
      .catch(() => {})
      .finally(() => setRestoring(false))
  }, [chatParam, slug])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    const isFirst = messages.length === 0
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: msg }])
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/${slug}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: msg, session_id: sessionId }),
      })
      const data = await res.json()
      if (isFirst && data.session_id) {
        setSearchParams({ chat: data.session_id }, { replace: true })
        setSessionId(data.session_id)
      }
      setMessages(prev => [...prev, {
        id:        crypto.randomUUID(),
        role:      'ai',
        text:      data.reply || data.detail || 'Sorry, something went wrong.',
        agent:     data.agent,
        citations: data.citations ?? [],
      }])
    } catch {
      setMessages(prev => [...prev, {
        id:   crypto.randomUUID(),
        role: 'ai',
        text: 'Connection error. Please try again.',
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const ThemeIcon = THEME_ICON[theme]
  const isEmpty   = messages.length === 0 && !restoring

  return (
    <div className={`flex flex-col h-screen ${t.bg} transition-colors duration-300`}>

      {/* Header */}
      <header className={`flex items-center justify-between px-5 py-3 flex-shrink-0 backdrop-blur-sm ${t.headerBg} transition-colors duration-300`}>
        <div className="flex items-center gap-2.5">
          {org?.logo_url && (
            <img src={org.logo_url} alt="logo" className="w-7 h-7 rounded-lg object-cover opacity-90" />
          )}
          <span className={`text-base font-bold tracking-tight ${t.text} transition-colors duration-300`}
            style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif", letterSpacing: '-0.02em' }}>
            {org?.name || slug}
          </span>
        </div>
        <button
          onClick={cycleTheme}
          className={`p-2 rounded-full transition-all duration-200 ${t.icon}`}
          title={`Switch theme (${THEME_NEXT[theme]})`}
        >
          <ThemeIcon className="w-4 h-4" />
        </button>
      </header>

      {/* Messages / Empty state */}
      <div className="flex-1 overflow-y-auto">
        {restoring && (
          <div className={`flex items-center justify-center h-full ${t.subtext} text-sm animate-pulse`}>
            Restoring conversation…
          </div>
        )}

        {/* Empty state — centered greeting + suggestions */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-6 pb-32">
            <div className="text-center mb-10 select-none">
              <h1 className={`text-3xl md:text-4xl font-light mb-2 ${t.text} transition-colors duration-300`}>
                Hi there,
              </h1>
              <h2 className={`text-3xl md:text-4xl font-light ${t.subtext} transition-colors duration-300`}>
                How can we help?
              </h2>
            </div>

            {/* Suggestion chips */}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className={`px-4 py-2.5 rounded-full border text-sm transition-all duration-200 ${t.chipBg} ${t.chipBorder} ${t.chipText} ${t.chipHover}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div className="px-6 py-6 space-y-4 max-w-4xl mx-auto w-full">
            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'ai' && msg.agent && (
                  <p className={`text-xs mb-1 px-1 ${t.subtext}`}>
                    🤖 {msg.agent.replace(/_/g, ' ')}
                  </p>
                )}
                <div
                  className={`max-w-[92%] px-5 py-4 rounded-2xl ${
                    msg.role === 'user'
                      ? `${t.userBubble} rounded-br-sm`
                      : `${t.aiBubble} rounded-bl-sm`
                  } transition-colors duration-300`}
                  style={msg.role === 'user' ? { backgroundColor: accentColor } : {}}
                >
                  {msg.role === 'user'
                    ? <span className="text-sm leading-relaxed">{msg.text}</span>
                    : <MarkdownMessage text={msg.text} />
                  }
                  {msg.role === 'ai' && msg.citations && msg.citations.length > 0 && (
                    <SourceCitation sources={msg.citations} />
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-start">
                <div className={`${t.aiBubble} rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center`}>
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full animate-bounce opacity-60"
                      style={{ backgroundColor: accentColor, animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className={`px-4 pb-6 pt-3 flex-shrink-0 transition-colors duration-300 ${isEmpty ? '' : 'border-t border-white/5'}`}>
        <div className={`max-w-4xl mx-auto flex items-center gap-2 px-4 py-3 rounded-full border shadow-lg ${t.inputBg} ${t.inputBorder} transition-all duration-300`}>
          <button className={`flex-shrink-0 ${t.icon} transition-colors`}>
            <Plus className="w-4 h-4" />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={`Ask ${org?.name || 'us'} anything…`}
            disabled={loading}
            autoFocus
            className={`flex-1 bg-transparent text-sm outline-none disabled:opacity-50 ${t.inputText} transition-colors duration-300`}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 transition-all duration-200 hover:scale-105"
            style={{ backgroundColor: accentColor }}
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className={`text-center text-xs mt-2.5 ${t.subtext} opacity-50`}>
          Powered by AI · Responses may not always be accurate
        </p>
      </div>
    </div>
  )
}
