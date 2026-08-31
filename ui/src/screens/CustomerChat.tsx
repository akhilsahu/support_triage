import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useAppStore } from '../store/useAppStore'
import { API_CONFIG } from '../config/api'
import { ArrowUp, Sun, Moon, Sparkles, X, User, Bot, Palette, ThumbsUp, ThumbsDown, Copy, Check, History, ChevronDown } from 'lucide-react'
import { SourceCitation } from '../components/ui/SourceCitation'
import { NotFound } from './NotFound'
import type { SourceItem } from '../types'
import { SectionRenderer } from '../renderengine/homepage'
import { ChatBlockRenderer, CHAT_BLOCKS_ENABLED, type ChatBlock } from '../renderengine/chatblocks'
import { fetchSSE } from '../lib/fetchSSE'
import { CustomerLoginGate } from '../components/chat/CustomerLoginGate'
import { ChatHistoryDrawer } from '../components/chat/ChatHistoryDrawer'
import {
  readCustomerAuth, clearCustomerAuth, customerAuthHeader, verifyCustomerAuth,
  type CustomerAuth,
} from '../lib/customerAuth'
import type { DataBlock, StatBand, ProcessSteps, Comparison } from '../renderengine/homepage'

const IS_EMBEDDED = window.self !== window.top

// ── Design tokens per theme ───────────────────────────────────────────────────
// Research refs:
//  - Avoid #000 (halation) → use #121212 (YouTube/Figma standard)
//  - Avoid #fff text → #e0e0e0 for dark, #0f172a for light (4.5:1 contrast)
//  - Glassmorphism: backdrop-blur + rgba fill + subtle border
//  - WCAG 2.1: min 44×44 px touch targets on interactive elements

type ThemeKey = 'indigo' | 'dark' | 'light'

interface ThemeTokens {
  // Layout
  pageBg: string
  headerBg: string
  headerBorder: string
  divider: string
  // Text
  textPrimary: string
  textSecondary: string
  textMuted: string
  // Bubbles
  userBubbleCls: string          // className
  userBubbleBg: string           // inline CSS background — theme-specific user bubble color
  aiBubbleCls: string
  aiAccentBar: string            // gradient class for the top bar
  // Input
  inputWrapCls: string
  inputFieldCls: string
  inputBorderFocus: string
  // Chips / suggestions
  chipCls: string
  chipHoverCls: string
  // Badge
  agentBadgeCls: string
  // Icon buttons
  iconBtnCls: string
  // Send button (bg handled by inline accentColor)
  sendBtnShadow: string
  // Typing dots
  typingDotCls: string
  // Avatar
  botAvatarCls: string
}

const THEMES: Record<ThemeKey, ThemeTokens> = {
  // ── Indigo dark — glassmorphism on deep navy ─────────────────────────────
  indigo: {
    pageBg:          'bg-[#0c0b1e]',
    headerBg:        'bg-[#0c0b1e]/80 backdrop-blur-md',
    headerBorder:    'border-white/[0.07]',
    divider:         'border-white/[0.07]',
    textPrimary:     'text-[#e8e8ff]',
    textSecondary:   'text-indigo-200/60',
    textMuted:       'text-indigo-300/35',
    userBubbleCls:   'text-white rounded-2xl rounded-br-sm shadow-lg',
    userBubbleBg:    'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',  // blue — no purple, pops on the navy bg
    aiBubbleCls:     'text-[#dde0ff]',
    aiAccentBar:     'from-indigo-500 via-violet-500 to-fuchsia-500',
    inputWrapCls:    'bg-white/[0.06] backdrop-blur-sm border border-white/[0.09] focus-within:border-indigo-400/50 focus-within:ring-2 focus-within:ring-indigo-500/15',
    inputFieldCls:   'text-[#e8e8ff] placeholder-indigo-300/30',
    inputBorderFocus:'',
    chipCls:         'bg-white/[0.05] border border-white/[0.09] text-indigo-200/70',
    chipHoverCls:    'hover:bg-indigo-500/20 hover:border-indigo-400/40 hover:text-indigo-100',
    agentBadgeCls:   'bg-indigo-500/15 border border-indigo-400/25 text-indigo-300',
    iconBtnCls:      'text-indigo-300/45 hover:text-indigo-100 hover:bg-white/5',
    sendBtnShadow:   'shadow-indigo-500/30',
    typingDotCls:    'bg-indigo-400',
    botAvatarCls:    'bg-gradient-to-br from-indigo-500 to-violet-600',
  },

  // ── Dark — #121212 standard (Figma/YouTube/Slack spec) ──────────────────
  dark: {
    pageBg:          'bg-[#121212]',
    headerBg:        'bg-[#121212]/95 backdrop-blur-sm',
    headerBorder:    'border-[#2a2a2a]',
    divider:         'border-[#2a2a2a]',
    textPrimary:     'text-[#e0e0e0]',
    textSecondary:   'text-[#888]',
    textMuted:       'text-[#555]',
    userBubbleCls:   'text-white rounded-2xl rounded-br-sm shadow-md',
    userBubbleBg:    'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',  // ocean blue — high contrast on near-black
    aiBubbleCls:     'text-[#e0e0e0]',
    aiAccentBar:     'from-violet-500 via-purple-500 to-fuchsia-400',
    inputWrapCls:    'bg-[#1e1e1e] border border-[#303030] focus-within:border-[#555] focus-within:ring-2 focus-within:ring-white/5',
    inputFieldCls:   'text-[#e0e0e0] placeholder-[#444]',
    inputBorderFocus:'',
    chipCls:         'bg-[#1c1c1c] border border-[#2e2e2e] text-[#aaa]',
    chipHoverCls:    'hover:bg-[#252525] hover:border-[#444] hover:text-[#ddd]',
    agentBadgeCls:   'bg-[#1f1f1f] border border-[#303030] text-[#888]',
    iconBtnCls:      'text-[#555] hover:text-[#ccc] hover:bg-white/5',
    sendBtnShadow:   'shadow-violet-500/25',
    typingDotCls:    'bg-[#666]',
    botAvatarCls:    'bg-[#252525] border border-[#333]',
  },

  // ── Light — slate-50 base, clean card surfaces (WCAG AA contrast) ───────
  light: {
    pageBg:          'bg-[#f4f6fb]',
    headerBg:        'bg-white/95 backdrop-blur-sm',
    headerBorder:    'border-[#e2e8f0]',
    divider:         'border-[#e2e8f0]',
    textPrimary:     'text-[#0f172a]',
    textSecondary:   'text-[#64748b]',
    textMuted:       'text-[#94a3b8]',
    userBubbleCls:   'text-white rounded-2xl rounded-br-sm shadow-md shadow-indigo-200/50',
    userBubbleBg:    'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',  // blue — no purple, strong on light bg
    aiBubbleCls:     'text-[#1e293b]',
    aiAccentBar:     'from-indigo-500 via-violet-500 to-purple-500',
    inputWrapCls:    'bg-white border border-[#e2e8f0] focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10',
    inputFieldCls:   'text-[#0f172a] placeholder-[#94a3b8]',
    inputBorderFocus:'',
    chipCls:         'bg-white border border-[#e2e8f0] text-[#475569]',
    chipHoverCls:    'hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700',
    agentBadgeCls:   'bg-indigo-50 border border-indigo-200 text-indigo-700',
    iconBtnCls:      'text-[#94a3b8] hover:text-[#475569] hover:bg-slate-100',
    sendBtnShadow:   'shadow-indigo-200/60',
    typingDotCls:    'bg-indigo-400',
    botAvatarCls:    'bg-gradient-to-br from-indigo-500 to-violet-600',
  },
}

const THEME_CYCLE: ThemeKey[] = ['indigo', 'dark', 'light']
const THEME_LABELS: Record<ThemeKey, string> = { indigo: 'Indigo', dark: 'Dark', light: 'Light' }

// ── Clarify widget (HITL ask_user) ────────────────────────────────────────────
//
// Renders the question's options as chips (single-select) or checkboxes +
// confirm (multi-select). Whichever the customer picks is sent through the
// exact same send(text) path as anything they'd type -- clicking "SBI Card
// PRIME" sends that literal string as a normal chat message, which is what
// makes the transcript read as an ordinary exchange instead of a special
// "answer" event (see docs/structured-response-rendering-plan.md). Options
// disable themselves the instant one is picked, purely to stop a double-send
// if the customer clicks twice before the next message arrives.
function ClarifyWidget({ clarify, theme: tk, onSend }: {
  clarify: ClarifyRequest; theme: ThemeTokens; onSend: (text: string) => void
}) {
  const [answered, setAnswered]   = useState(false)
  const [picked, setPicked]       = useState<string[]>([])

  if (!clarify.options.length) return null   // free-text question — the normal input box already covers this

  const pick = (label: string) => {
    if (clarify.multi_select) {
      setPicked(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
      return
    }
    setAnswered(true)
    onSend(label)
  }

  const confirmMulti = () => {
    if (!picked.length) return
    setAnswered(true)
    onSend(picked.join(', '))
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {clarify.options.map((label) => {
          const selected = picked.includes(label)
          return (
            <button
              key={label}
              type="button"
              disabled={answered}
              onClick={() => pick(label)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-default
                         ${tk.chipCls} ${selected ? 'ring-2 ring-indigo-400' : ''}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {clarify.multi_select && (
        <button
          type="button"
          disabled={answered || !picked.length}
          onClick={confirmMulti}
          className="self-start px-3 py-1.5 rounded-full text-[12.5px] font-semibold bg-indigo-500 text-white disabled:opacity-40"
        >
          Confirm
        </button>
      )}
    </div>
  )
}

// ── Thinking / chain-of-thought block ─────────────────────────────────────────

function ThinkingBlock({ text, live, isDark }: { text: string; live: boolean; isDark: boolean }) {
  const [open, setOpen] = useState(live)
  // Collapse once the reply finishes streaming — the live phase auto-expands.
  useEffect(() => {
    if (!live && open) setOpen(false)
  }, [live])

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 ${isDark ? 'text-indigo-300/70' : 'text-indigo-600/70'} hover:opacity-100 opacity-80 transition-opacity`}
      >
        <Sparkles className={`w-3.5 h-3.5 ${live ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-semibold tracking-wide uppercase">{live ? 'Thinking…' : 'Thinking'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`mt-2 text-[12.5px] leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2.5 border
                         ${isDark ? 'bg-white/[0.03] border-white/[0.07] text-[#9aa0c8]' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
          {text || '…'}
        </div>
      )}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownMessage({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p:  ({ children }) => <p className="text-[15px] leading-[1.8] mb-2.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic opacity-80">{children}</em>,

        h1: ({ children }) => (
          <h1 className="text-[15px] font-bold mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500 flex-shrink-0" />
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[14px] font-semibold mt-3.5 mb-1.5 flex items-center gap-2 opacity-90">
            <span className="w-1 h-3 rounded-full bg-indigo-400/70 flex-shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[12.5px] font-semibold mt-2.5 mb-1 uppercase tracking-widest text-indigo-400">
            {children}
          </h3>
        ),

        ul: ({ children }) => (
          <ul className="my-2.5 space-y-2 pl-4 list-none
                         [&>li]:relative
                         [&>li]:before:absolute [&>li]:before:-left-3.5
                         [&>li]:before:top-[10px] [&>li]:before:w-1.5 [&>li]:before:h-1.5
                         [&>li]:before:rounded-full [&>li]:before:bg-indigo-400/70">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2.5 space-y-2.5 pl-0 list-none">
            {children}
          </ol>
        ),
        li: ({ children, node }) => {
          const isOrdered = (node as any)?.parent?.tagName === 'ol'
          if (isOrdered) {
            return (
              <li className="flex gap-3 items-start">
                <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5
                                  ${isDark ? 'bg-indigo-500/25 text-indigo-300 ring-1 ring-indigo-500/30'
                                           : 'bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200'}`}>
                  ·
                </span>
                <span className="flex-1 text-[15px] leading-[1.8]">{children}</span>
              </li>
            )
          }
          return <li className="text-[15px] leading-[1.8]">{children}</li>
        },

        code: ({ className, children }) => {
          if (className?.includes('language-')) {
            return <code className="block font-mono text-[12.5px]">{children}</code>
          }
          return (
            <code className={`px-1.5 py-0.5 rounded-md text-[12.5px] font-mono align-middle
                              ${isDark ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-900/60'
                                       : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className={`my-3 p-4 rounded-xl text-[12.5px] font-mono overflow-x-auto leading-relaxed
                           ${isDark ? 'bg-black/40 border border-white/10 text-[#e0e0e0]'
                                    : 'bg-[#1e1e2e] border border-[#2a2a3a] text-[#cdd6f4]'}`}>
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className={`my-2.5 pl-3.5 border-l-2 rounded-r-lg py-1.5 italic text-[14px]
                                  ${isDark ? 'border-indigo-400/60 bg-indigo-950/30 opacity-80'
                                           : 'border-indigo-400 bg-indigo-50 text-slate-600'}`}>
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className={`my-3 overflow-x-auto rounded-xl border text-[13px]
                           ${isDark ? 'border-white/10' : 'border-[#e2e8f0]'}`}>
            <table className="w-full border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className={isDark ? 'bg-indigo-950/50' : 'bg-slate-50'}>{children}</thead>
        ),
        th: ({ children }) => (
          <th className={`px-4 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide border-b
                          ${isDark ? 'text-indigo-300 border-white/10' : 'text-slate-500 border-[#e2e8f0]'}`}>
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className={`px-4 py-2 border-b
                          ${isDark ? 'border-white/5' : 'border-[#f1f5f9]'}`}>
            {children}
          </td>
        ),
        hr:  () => <hr className={`my-3 ${isDark ? 'border-white/10' : 'border-[#e2e8f0]'}`} />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors text-indigo-400 hover:text-indigo-300 decoration-indigo-500/40">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirrors app/api/customer.py's ClarifyRequest. Present only on a live AI
// message whose run paused on ask_user instead of answering -- history restore
// never populates this, so an answered question just becomes plain text on
// reload with no special replay logic needed (see
// docs/structured-response-rendering-plan.md, "Scenario 2").
interface ClarifyRequest {
  question: string
  header: string
  options: string[]
  multi_select: boolean
}

interface Message {
  id: string
  role: 'user' | 'ai'
  text: string
  agent?: string
  citations?: SourceItem[]
  blocks?: ChatBlock[]            // structured table/card/tabs — see renderengine/chatblocks
  clarify?: ClarifyRequest        // agent is asking a question instead of answering
  ts?: Date
  messageId?: string             // server-side ConversationLog id — anchors feedback
  feedback?: 'up' | 'down'       // customer rating on this AI reply
  reasoning?: string             // chain-of-thought behind this reply (collapsible "Thinking…" block)
  thinking?: boolean             // true while this AI message is still streaming (live placeholder)
}

interface SpaceInfo {
  name: string
  description?: string
  logo_url?: string
  theme_color?: string
  homepage_sections?: string[]
  section_overrides?: { promo?: { text: string } }
  key_benefits?: string[]
  capabilities?: string[]
  faq?: { question: string; answer: string }[]
  quick_topics?: { label: string; prompt: string }[]
  trust_badges?: string[]
  data_block?: DataBlock
  stat_band?: StatBand
  process_steps?: ProcessSteps
  comparison?: Comparison
  // Customer-login gate: null/absent = never, 0 = before the first message,
  // N = N free messages then sign-in (server enforces; see chatbot_auth.py).
  login_after_messages?: number | null
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomerChat() {
  const { slug: slugParam, chatbotSlug } = useParams<{ slug?: string; chatbotSlug?: string }>()
  const storeSlug                       = useAppStore(s => s.spaceSlug)
  const slug                            = slugParam || storeSlug || ''
  // When a specific chatbot is addressed via /{slug}/{chatbotSlug}, forward it to
  // every customer endpoint so the whole conversation stays on that bot.
  const botQuery                        = chatbotSlug ? `?chatbot=${encodeURIComponent(chatbotSlug)}` : ''
  const [searchParams, setSearchParams] = useSearchParams()
  const chatParam                       = searchParams.get('chat')

  const [space, setSpace]               = useState<SpaceInfo | null>(null)
  const [notFound, setNotFound]         = useState(false)
  const [messages, setMessages]         = useState<Message[]>([])
  const [suggestions, setSuggestions]   = useState<string[]>([
    'How can I track my order?',
    'What is your return policy?',
    'I need help with my account',
    'How do I contact support?',
  ])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [restoring, setRestoring]       = useState(!!chatParam)
  const [sessionId, setSessionId]       = useState(() => chatParam || crypto.randomUUID())
  const [escalated, setEscalated]       = useState(false)
  const [escalating, setEscalating]     = useState(false)
  const [humanTransferEnabled, setHumanTransferEnabled] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const sseRef        = useRef<EventSource | null>(null)
  const titleBaseRef  = useRef<string>('Live Chat')
  const awayUnreadRef = useRef<number>(0)
  // True once the conversation was started in THIS tab. The session-restore
  // effect below is only for deep-links (a URL that already carries ?chat=…);
  // when we write ?chat= ourselves after the first send, this flag stops that
  // effect from re-fetching and flashing "Restoring conversation…" over the
  // messages we already have locally.
  const ownSessionRef = useRef(false)

  // Signed-in end customer + the platform's Google client id (empty when Google
  // sign-in isn't configured server-side, in which case the gate never blocks).
  const [customer, setCustomer] = useState<CustomerAuth | null>(() => readCustomerAuth())
  const [googleClientId, setGoogleClientId] = useState('')
  const [loginRequired, setLoginRequired] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [theme, setTheme] = useState<ThemeKey>(() => {
    const stored = localStorage.getItem('chat-theme') as ThemeKey
    return stored && stored in THEMES ? stored : 'indigo'
  })

  const [isVisible, setIsVisible] = useState(!IS_EMBEDDED)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const t         = THEMES[theme]
  const isDark    = theme !== 'light'
  const accentColor = space?.theme_color || '#6366f1'

  const cycleTheme = () => {
    const idx  = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    setTheme(next)
    localStorage.setItem('chat-theme', next)
  }

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    // Cheap visitor signals for the homepage-section recommendation (see
    // app/renderengine/homepage_sections.py). Harmless to send even while
    // HOMEPAGE_SECTIONS_ENABLED is off -- the backend already derives safe
    // defaults if these are absent.
    const device = window.innerWidth < 768 ? 'mobile' : 'desktop'
    const visitedKey = `support247-visited-${slug}`
    const visitorType = localStorage.getItem(visitedKey) ? 'returning' : 'new'
    localStorage.setItem(visitedKey, '1')
    const publicInfoParams = new URLSearchParams({ device, visitor: visitorType })
    if (chatbotSlug) publicInfoParams.set('chatbot', chatbotSlug)

    fetch(`${API_CONFIG.baseURL}/api/v1/space/public/${slug}?${publicInfoParams.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setSpace(data)
          if (data.human_transfer_enabled === false) setHumanTransferEnabled(false)
        } else {
          setNotFound(true)
        }
      })
      .catch(() => setSpace({ name: slug }))
  }, [slug])

  useEffect(() => {
    const name = space?.name || slug || 'Live Chat'
    titleBaseRef.current = name
    if (document.visibilityState === 'visible') document.title = name
  }, [space, slug])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        awayUnreadRef.current = 0
        document.title = titleBaseRef.current
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); document.title = titleBaseRef.current }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    sseRef.current?.close()
    const es = new EventSource(`${API_CONFIG.baseURL}/api/v1/inbox/customer-stream?session_id=${sessionId}`)
    sseRef.current = es

    es.addEventListener('human_message', (e) => {
      const d = JSON.parse(e.data)
      setEscalated(true)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: d.content, agent: d.staff_name || 'Agent', ts: new Date() }])
      if (IS_EMBEDDED && !isVisible) window.parent.postMessage({ type: 'support247:unread', count: 1, preview: d.content }, '*')
      if (document.hidden) {
        awayUnreadRef.current += 1
        document.title = `(${awayUnreadRef.current}) New repl${awayUnreadRef.current > 1 ? 'ies' : 'y'} · ${titleBaseRef.current}`
      }
    })
    es.addEventListener('staff_assigned', (e) => {
      const d = JSON.parse(e.data)
      setEscalated(true)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: `${d.staff_name || 'A support agent'} has joined the conversation.`, ts: new Date() }])
    })
    es.addEventListener('queue_position_update', (e) => {
      const d = JSON.parse(e.data)
      setEscalated(true)
      setMessages(prev => {
        const posMsg = `You are #${d.position} in queue. We'll be with you shortly.`
        const last = prev[prev.length - 1]
        if (last?.text?.startsWith('You are #')) return [...prev.slice(0, -1), { ...last, text: posMsg }]
        return [...prev, { id: crypto.randomUUID(), role: 'ai', text: posMsg, ts: new Date() }]
      })
    })
    es.addEventListener('session_closed', () => {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: 'This support session has been closed. Thank you for contacting us.', ts: new Date() }])
      es.close()
    })
    es.onerror = () => {}
    return () => { es.close(); sseRef.current = null }
  }, [sessionId])

  useEffect(() => {
    if (!slug) return
    fetch(`${API_CONFIG.baseURL}/api/chat/${slug}/suggestions${botQuery}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.suggestions) setSuggestions(data.suggestions) })
      .catch(() => {})
  }, [slug])

  useEffect(() => {
    if (!chatParam || !slug) return
    // Only restore a session we didn't start in this tab -- otherwise writing
    // ?chat= after the first send would re-enter here and flash the restoring
    // state over the live conversation.
    if (ownSessionRef.current) return
    setRestoring(true)
    fetch(`${API_CONFIG.baseURL}/api/chat/${slug}/session/${chatParam}${botQuery}`,
          { headers: { ...customerAuthHeader() } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setMessages(data.history.map((h: any) => ({
          id: h.id || crypto.randomUUID(),
          role: h.role === 'user' ? 'user' : 'ai',
          text: h.message || h.content || '',
          agent: h.agent_slug ?? undefined,
          citations: h.citations ?? [],
          blocks: h.blocks ?? undefined,
          reasoning: h.reasoning ?? undefined,
          messageId: h.role === 'user' ? undefined : h.id,
          ts: new Date(h.timestamp || h.created_at || Date.now()),
        })))

        setSessionId(chatParam)
        if (data.ai_disabled || ['active','queued','escalated'].includes(data.status)) setEscalated(true)
      })
      .catch(() => {})
      .finally(() => setRestoring(false))
  }, [chatParam, slug])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // Validate any stored customer token once on load — it may have expired, and
  // a stale token would otherwise look signed-in while the server 401s.
  useEffect(() => {
    if (!readCustomerAuth()) return
    verifyCustomerAuth().then(auth => setCustomer(auth))
  }, [])

  // Google client id comes from the platform settings the page already exposes.
  // Empty = sign-in isn't configured, so the gate stays open rather than showing
  // a dead button.
  useEffect(() => {
    fetch(`${API_CONFIG.baseURL}/api/v1/super-admin/settings/public`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.google_client_id) setGoogleClientId(d.google_client_id) })
      .catch(() => {})
  }, [])

  // Soft gate: how many messages this visitor has already sent vs the bot's
  // threshold. The server enforces the same rule (401 login_required) — this is
  // only so the button appears at the right moment.
  const loginThreshold = space?.login_after_messages ?? null
  const sentCount      = messages.filter(m => m.role === 'user').length
  const gateActive     = !customer && !!googleClientId && loginThreshold !== null
  const showLoginGate  = (gateActive && sentCount >= (loginThreshold ?? 0)) || loginRequired
  const freeLeft       = gateActive ? Math.max(0, (loginThreshold ?? 0) - sentCount) : 0

  // ── postMessage bridge ───────────────────────────────────────────────────
  useEffect(() => { if (IS_EMBEDDED) window.parent.postMessage({ type: 'support247:ready' }, '*') }, [])
  useEffect(() => {
    if (!IS_EMBEDDED) return
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return
      switch (e.data.type) {
        case 'support247:show': setIsVisible(true); setTimeout(() => inputRef.current?.focus(), 100); break
        case 'support247:hide': setIsVisible(false); break
        case 'support247:config':
          if (e.data.customer_email) sessionStorage.setItem('s247_email', e.data.customer_email)
          if (e.data.customer_name)  sessionStorage.setItem('s247_name',  e.data.customer_name)
          if (e.data.customer_id)    sessionStorage.setItem('s247_cid',   e.data.customer_id)
          break
        case 'support247:page':
          if (e.data.url)   sessionStorage.setItem('s247_page_url',   e.data.url)
          if (e.data.title) sessionStorage.setItem('s247_page_title', e.data.title)
          break
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const closeWidget = useCallback(() => {
    if (IS_EMBEDDED) window.parent.postMessage({ type: 'support247:close' }, '*')
  }, [])

  const escalateToHuman = async () => {
    if (escalating || escalated) return
    setEscalating(true)
    try {
      const res  = await fetch(`${API_CONFIG.baseURL}/api/v1/inbox/escalate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, reason: 'customer_request' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: data.detail || 'Human support is not available right now.', ts: new Date() }])
        return
      }
      setEscalated(true)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: data.message || "You've been connected to a human agent. They'll be with you shortly.", ts: new Date() }])
    } catch { /* silent */ } finally { setEscalating(false) }
  }

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    const isFirst   = messages.length === 0
    const userMsgId = crypto.randomUUID()
    const aiMsgId   = crypto.randomUUID()
    // Push a live AI placeholder immediately; reasoning deltas and reply
    // chunks stream into it as SSE events arrive.
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: msg, ts: new Date() },
      { id: aiMsgId, role: 'ai', text: '', thinking: true, ts: new Date() },
    ])
    setLoading(true)
    try {
      await fetchSSE({
        url: `${API_CONFIG.baseURL}/api/chat/${slug}/stream${botQuery}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...customerAuthHeader() },
        body: JSON.stringify({ message: msg, session_id: sessionId }),
        onEvent: (eventType, data) => {
          if (eventType === 'reasoning') {
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, reasoning: (m.reasoning ?? '') + data }
              : m))
          } else if (eventType === 'message' || eventType === 'content') {
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: (m.text ?? '') + data, thinking: false }
              : m))
          } else if (eventType === 'done') {
            let d: any = {}
            try { d = JSON.parse(data) } catch { /* malformed — ignore */ }
            setMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text:      d.clarify?.question ?? d.reply ?? (m.text || 'No response text.'),
              thinking:  false,
              agent:     d.agent,
              citations: d.citations ?? [],
              blocks:    d.blocks ?? [],
              clarify:   d.clarify ?? undefined,
              messageId: d.message_id,
              reasoning: d.reasoning ?? m.reasoning,
            } : m))
            if (isFirst && d.session_id) {
              ownSessionRef.current = true
              setSearchParams({ chat: d.session_id }, { replace: true })
              setSessionId(d.session_id)
            }
          }
        },

        // Server answered with JSON instead of SSE — the human handoff path
        // (escalated session) returns the handoff message as a 200 JSON body.
        onJson: (status, payload) => {
          const data = (payload ?? {}) as any
          if (status >= 200 && status < 300 && data?.message) {
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, thinking: false, text: data.message, agent: data.agent } : m))
          } else {
            setMessages(prev => [
              ...prev.filter(m => m.id !== aiMsgId),
              { id: crypto.randomUUID(), role: 'ai', text: data?.detail || 'Something went wrong. Please try again.', ts: new Date() },
            ])
          }
        },
        onError: (err) => {
          // Server-side login gate (authoritative). Put the message back in
          // the box so it isn't lost behind the sign-in step.
          if (err?.code === 'login_required') {
            setMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== aiMsgId))
            setInput(msg)
            setLoginRequired(true)
            return
          }
          // Keep any partial reply already streamed; otherwise surface the
          // server's detail (e.g. 503 "No active agents") or a connection error.
          setMessages(prev => prev.map(m => m.id === aiMsgId
            ? { ...m, thinking: false, text: m.text || (err?.detail || 'Connection error. Please try again.') }
            : m))
        },
      })
    } catch {
      // fetch itself rejected before fetchSSE could route it (rare) — drop the
      // placeholder and show a generic error.
      setMessages(prev => [
        ...prev.filter(m => m.id !== aiMsgId),
        { id: crypto.randomUUID(), role: 'ai', text: 'Connection error. Please try again.', ts: new Date() },
      ])
    } finally { setLoading(false); setTimeout(() => inputRef.current?.focus(), 50) }
  }

  // ── Per-message actions ────────────────────────────────────────────────────
  const copyMessage = async (m: Message) => {
    try {
      await navigator.clipboard.writeText(m.text)
      setCopiedId(m.id)
      setTimeout(() => setCopiedId(prev => (prev === m.id ? null : prev)), 1500)
    } catch { /* clipboard blocked — silent */ }
  }

  const sendFeedback = (m: Message, rating: 'up' | 'down') => {
    if (!m.messageId || m.feedback) return   // no anchor, or already rated
    // Optimistic — feedback is a background signal, not worth blocking the UI on.
    setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, feedback: rating } : x)))
    fetch(`${API_CONFIG.baseURL}/api/chat/${slug}/feedback${botQuery}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: m.messageId, rating }),
    }).catch(() => {})
  }

  const isEmpty = messages.length === 0 && !restoring
  if (notFound) return <NotFound />

  // ── Time formatter ───────────────────────────────────────────────────────
  const fmt = (d: Date | undefined) =>
    d instanceof Date && !isNaN(d.getTime())
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : ''

  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 ${t.pageBg}`}>

      {/* ══════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════ */}
      <header className={`flex items-center justify-between px-4 sm:px-5 py-3 flex-shrink-0 border-b transition-colors duration-300 ${t.headerBg} ${t.headerBorder}`}>
        <div className="flex items-center gap-3 min-w-0">
          {/* Brand avatar */}
          {space?.logo_url ? (
            <img src={space.logo_url} alt={space.name} className="w-9 h-9 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/10" />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className={`text-[14.5px] font-bold truncate ${t.textPrimary}`} style={{ letterSpacing: '-0.01em' }}>
              {space?.name || slug}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className={`text-[11px] truncate ${t.textSecondary}`}>Online · replies instantly</span>
            </div>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Past conversations — only meaningful once signed in, since that's
              what ties a conversation to a person. */}
          {customer && (
            <button onClick={() => setHistoryOpen(true)} title="Your conversations"
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${t.iconBtnCls}`}>
              <History className="w-4 h-4" />
            </button>
          )}
          {/* Signed-in customer — avatar doubles as the sign-out control. */}
          {customer && (
            <button
              onClick={() => { clearCustomerAuth(); setCustomer(null) }}
              title={`Signed in as ${customer.user.email ?? customer.user.name ?? 'you'} — click to sign out`}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${t.iconBtnCls}`}>
              {customer.user.avatar_url
                ? <img src={customer.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                : <User className="w-4 h-4" />}
            </button>
          )}
          {/* Theme toggle — 44×44 touch target */}
          <button onClick={cycleTheme} title={`Theme: ${THEME_LABELS[theme]}`}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${t.iconBtnCls}`}>
            {theme === 'indigo' ? <Palette className="w-4 h-4" />
              : theme === 'dark' ? <Moon className="w-4 h-4" />
              : <Sun className="w-4 h-4" />}
          </button>
          {IS_EMBEDDED && (
            <button onClick={closeWidget} title="Close"
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${t.iconBtnCls}`}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          MESSAGES
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* Restoring indicator */}
        {restoring && (
          <div className={`flex items-center justify-center h-full text-[13px] animate-pulse ${t.textSecondary}`}>
            Restoring conversation…
          </div>
        )}

        {/* ── Empty / welcome state ──
            Purely admin-config driven: homepage_sections is only present in
            the API response when this chatbot's admin has turned it on
            (Chatbot.homepage_sections_enabled, see ChatbotProfile). No env
            var or build flag involved. Absent/empty falls through to the
            exact original hardcoded markup below -- unchanged, byte-for-byte. */}
        {space?.homepage_sections?.length ? (
          // The AI-composed welcome sections stay mounted once the chat starts
          // -- they become the scroll-up "intro" above the thread instead of
          // vanishing. Fill the viewport only while empty; once there are
          // messages, take natural height so the thread sits right below.
          <div className={`flex flex-col items-center px-6 pt-5 sm:pt-6 select-none text-center
                           ${isEmpty ? 'justify-start min-h-full pb-28' : 'pb-5'}`}>
            <SectionRenderer
              sections={space?.homepage_sections ?? []}
              theme={t}
              space={space}
              suggestions={suggestions}
              onSend={send}
              overrides={space?.section_overrides}
              keyBenefits={space?.key_benefits}
              capabilities={space?.capabilities}
              faq={space?.faq}
              quickTopics={space?.quick_topics}
              trustBadges={space?.trust_badges}
              dataBlock={space?.data_block}
              statBand={space?.stat_band}
              processSteps={space?.process_steps}
              comparison={space?.comparison}
            />
          </div>
        ) : isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-6 pb-32 select-none text-center">
            {/* Hero — brand logo when available, else the gradient mark */}
            <div className="relative mb-6">
              {space?.logo_url ? (
                <img src={space.logo_url} alt={space.name}
                  className="w-20 h-20 rounded-3xl object-cover shadow-2xl shadow-indigo-500/20 mx-auto ring-1 ring-white/10" />
              ) : (
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 mx-auto">
                  <Sparkles className="w-9 h-9 text-white" />
                </div>
              )}
              <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center ring-2 ring-white/10 shadow-md">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              </span>
            </div>
            <h1 className={`text-[28px] font-semibold mb-1.5 ${t.textPrimary}`} style={{ letterSpacing: '-0.02em' }}>
              Hi there 👋
            </h1>
            {/* Capability line — the chatbot's own description tells the user
                exactly what this bot is for; falls back to a generic prompt. */}
            <p className={`text-[15px] mb-1 max-w-md ${t.textSecondary}`}>
              {space?.description
                ? `I'm ${space.name}'s assistant. ${space.description}`
                : `How can we help you today?`}
            </p>
            <p className={`text-[13px] mb-7 ${t.textMuted}`}>
              Pick a question below or type your own.
            </p>

            {/* Suggestion chips */}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2.5 max-w-xl w-full">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className={`px-4 py-2.5 rounded-full border text-[13.5px] font-medium
                                transition-all duration-200 active:scale-95 shadow-sm
                                ${t.chipCls} ${t.chipHoverCls}`}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Message thread ── */}
        {!isEmpty && (
          <div className="px-4 sm:px-5 py-5 space-y-4 max-w-3xl mx-auto w-full">
            {messages.map((msg, idx) => {
              const isUser       = msg.role === 'user'
              const prevMsg      = messages[idx - 1]
              const showAvatar   = !isUser && (idx === 0 || prevMsg?.role !== 'ai')
              const showTime     = idx === messages.length - 1 ||
                                   messages[idx + 1]?.role !== msg.role
              const isLastMsg    = idx === messages.length - 1

              return (
                <div key={msg.id} className={`flex gap-2.5 animate-fadeIn ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

                  {/* Avatar — 32×32, only on first in a group */}
                  <div className="flex-shrink-0 w-8">
                    {showAvatar && !isUser && (
                      space?.logo_url ? (
                        <img src={space.logo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${t.botAvatarCls}`}>
                          <Bot className="w-4 h-4" />
                        </div>
                      )
                    )}
                    {isUser && showAvatar && (
                      <div className="w-8 h-8 rounded-full bg-slate-500 flex items-center justify-center text-white">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Bubble column */}
                  <div className={`flex flex-col gap-1 min-w-0 ${isUser ? 'items-end max-w-[82%]' : 'items-start w-full'}`}>

                    {/* Agent badge — shown once at top of AI group */}
                    {!isUser && showAvatar && msg.agent && (
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-0.5 ${t.agentBadgeCls}`}>
                        {msg.agent.replace(/_/g, ' ')}
                      </span>
                    )}

                    {/* Bubble */}
                    {isUser ? (
                      /* ── User bubble ── */
                      <div className={`px-4 py-3 ${t.userBubbleCls}`}
                        style={{ background: t.userBubbleBg }}>
                        <p className="text-[14.5px] leading-[1.75] whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    ) : (
                      /* ── AI bubble — document style ── */
                      <div className={`w-full ${t.aiBubbleCls}`}>
                        <div className="py-1">
                          {/* Live placeholder dots before any reasoning/reply arrives */}
                          {msg.thinking && !msg.reasoning && !msg.text && (
                            <div className="flex items-center gap-2 py-1">
                              <div className="flex gap-1.5">
                                {[0, 160, 320].map(d => (
                                  <span key={d} className={`w-2 h-2 rounded-full animate-bounce ${t.typingDotCls}`}
                                    style={{ animationDelay: `${d}ms`, animationDuration: '900ms' }} />
                                ))}
                              </div>
                              <span className={`text-[12px] ${t.textSecondary}`}>Thinking…</span>
                            </div>
                          )}
                          {/* Chain-of-thought — auto-expanded while streaming, collapsed on completion */}
                          {msg.reasoning && (
                            <ThinkingBlock text={msg.reasoning} live={!!msg.thinking} isDark={isDark} />
                          )}
                          {msg.text && <MarkdownMessage text={msg.text} isDark={isDark} />}
                          {CHAT_BLOCKS_ENABLED && msg.blocks && msg.blocks.length > 0 && (
                            <ChatBlockRenderer blocks={msg.blocks} theme={t} />
                          )}
                          {msg.clarify && isLastMsg && !loading && (
                            <ClarifyWidget clarify={msg.clarify} theme={t} onSend={send} />
                          )}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/[0.08]' : 'border-slate-100'}`}>
                              <SourceCitation sources={msg.citations} dark={isDark} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── AI message actions — copy + thumbs (real replies only) ── */}
                    {!isUser && msg.messageId && (
                      <div className="flex items-center gap-0.5 mt-0.5 -ml-1">
                        <button onClick={() => copyMessage(msg)} title="Copy"
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${t.iconBtnCls}`}>
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => sendFeedback(msg, 'up')} disabled={!!msg.feedback} title="Helpful"
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:cursor-default
                                      ${msg.feedback === 'up' ? 'text-emerald-400' : t.iconBtnCls}`}>
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => sendFeedback(msg, 'down')} disabled={!!msg.feedback} title="Not helpful"
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:cursor-default
                                      ${msg.feedback === 'down' ? 'text-rose-400' : t.iconBtnCls}`}>
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        {/* Thumbs-down only offers a human when THIS chatbot allows it. */}
                        {msg.feedback === 'down' && humanTransferEnabled && !escalated && (
                          <button onClick={escalateToHuman} disabled={escalating}
                            className={`ml-1 text-[11.5px] font-medium underline underline-offset-2 ${t.textSecondary} hover:opacity-100 opacity-80`}>
                            {escalating ? 'Connecting…' : 'Talk to a human'}
                          </button>
                        )}
                        {msg.feedback === 'up' && (
                          <span className={`ml-1 text-[11px] ${t.textMuted}`}>Thanks for the feedback</span>
                        )}
                      </div>
                    )}

                    {/* Timestamp — shown at bottom of each group */}
                    {showTime && (
                      <span className={`text-[10.5px] px-0.5 ${t.textMuted}`}>{fmt(msg.ts)}</span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* ── Typing indicator (hidden while a live AI placeholder bubbles) ── */}
            {loading && !messages.some(m => m.thinking) && (
              <div className="flex gap-2.5 animate-fadeIn">
                {space?.logo_url ? (
                  <img src={space.logo_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 ${t.botAvatarCls}`}>
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div className={`w-full ${t.aiBubbleCls}`}>
                  <div className="py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      {[0, 160, 320].map(d => (
                        <span key={d} className={`w-2 h-2 rounded-full animate-bounce ${t.typingDotCls}`}
                          style={{ animationDelay: `${d}ms`, animationDuration: '900ms' }} />
                      ))}
                    </div>
                    <span className={`text-[12px] ${t.textSecondary}`}>Thinking…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          INPUT BAR
      ══════════════════════════════════════════════════════════════════ */}
      <div className={`flex-shrink-0 px-4 sm:px-5 pb-5 pt-3 transition-colors duration-300 ${!isEmpty ? `border-t ${t.headerBorder}` : ''}`}>
        <div className="max-w-3xl mx-auto">
          {/* Persistent quick-prompts — keep starter questions one tap away
              mid-conversation. Hidden once a human takes over. */}
          {!isEmpty && !escalated && suggestions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2.5 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} disabled={loading}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full border text-[12.5px] font-medium
                              transition-all duration-200 active:scale-95 disabled:opacity-40
                              ${t.chipCls} ${t.chipHoverCls}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {/* Customer login gate — replaces the input when this chatbot requires
              sign-in (immediately, or once the free messages are used up). The
              server enforces the same rule, so this is presentation only. */}
          {showLoginGate ? (
            <CustomerLoginGate
              slug={slug}
              clientId={googleClientId}
              sessionId={sessionId}
              botQuery={botQuery}
              isDark={isDark}
              message={sentCount > 0
                ? 'Sign in to keep this conversation and continue.'
                : `Sign in to start chatting with ${space?.name || 'us'}.`}
              onSignedIn={auth => { setCustomer(auth); setLoginRequired(false) }}
            />
          ) : (
          <>
          {/* A nudge while free messages remain, so the gate isn't a surprise. */}
          {freeLeft > 0 && freeLeft <= 2 && (
            <p className={`text-[11.5px] mb-1.5 text-center ${t.textMuted}`}>
              {freeLeft} free message{freeLeft === 1 ? '' : 's'} left — sign in to save your history.
            </p>
          )}
          {/* Input pill — WCAG: min height 44px */}
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all duration-200 min-h-[52px] ${t.inputWrapCls}`}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={`Ask ${space?.name || 'us'} anything…`}
              disabled={loading}
              autoFocus
              className={`flex-1 bg-transparent text-[14.5px] outline-none disabled:opacity-40 min-w-0 ${t.inputFieldCls}`}
            />
            {/* Send — flat circular button (Claude/Gemini style): neutral when
                empty, solid accent once there's text. No gradient/heavy shadow. */}
            <button onClick={() => send()} disabled={loading || !input.trim()}
              aria-label="Send message"
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                         transition-all duration-200 active:scale-90 disabled:cursor-not-allowed"
              style={{ background: loading || input.trim()
                ? accentColor
                : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)') }}>
              {loading
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <ArrowUp className={`w-4 h-4 ${input.trim() ? 'text-white' : t.textMuted}`} strokeWidth={2.5} />
              }
            </button>
          </div>
          </>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between mt-2 px-1">
            <p className={`text-[11.5px] ${t.textMuted}`}>
              Powered by AI · Responses may not always be accurate
            </p>
            <div>
              {!escalated && messages.length > 0 && humanTransferEnabled && (
                <button onClick={escalateToHuman} disabled={escalating}
                  className={`text-[11.5px] font-medium underline underline-offset-2 transition-opacity
                              ${t.textSecondary} hover:opacity-100 opacity-70`}>
                  {escalating ? 'Connecting…' : 'Talk to a human'}
                </button>
              )}
              {escalated && (
                <span className={`text-[11.5px] font-medium ${t.textSecondary} opacity-70`}>
                  👤 Human agent active
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Past conversations. Identity is platform-wide, so this can resume a
          chat from another brand's chatbot too — that navigates there. */}
      <ChatHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentSlug={slug}
        currentSessionId={sessionId}
        isDark={isDark}
        onDeleted={() => {
          // Account gone — drop back to an anonymous, empty chat.
          setCustomer(null)
          setMessages([])
          setSessionId(crypto.randomUUID())
          setSearchParams({}, { replace: true })
        }}
        onNewChat={() => {
          setMessages([])
          setEscalated(false)
          ownSessionRef.current = false
          setSessionId(crypto.randomUUID())
          setSearchParams({}, { replace: true })
        }}
        onResume={s => {
          if (s.space_slug === slug) {
            // Same brand — swap the session in place; the ?chat= effect restores it.
            setMessages([])
            ownSessionRef.current = false
            setSessionId(s.id)
            setSearchParams({ chat: s.id }, { replace: true })
          } else {
            // Another brand's chatbot — the customer token travels with them.
            const path = s.chatbot_slug ? `/${s.space_slug}/${s.chatbot_slug}` : `/${s.space_slug}`
            window.location.assign(`${path}?chat=${s.id}`)
          }
        }}
      />
    </div>
  )
}
