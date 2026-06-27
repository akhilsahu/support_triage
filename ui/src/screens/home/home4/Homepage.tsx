/**
 * Homepage Theme 4 — "Sunrise Light"
 *
 * Palette  : white/slate-50 background · violet→teal gradient accents
 * Text     : slate-900 / slate-700 / slate-500  (dark, readable)
 * Buttons  : from-violet-600 to-teal-500 gradient
 * Research : soft airy gradients, trust=indigo, growth=teal, dark text for readability
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Search, ArrowRight, Sparkles, CheckCircle2, Bot, Shield,
  BarChart3, Globe, MessageSquare, ShoppingBag, Layers, ShieldCheck,
  Home, Zap, Clock, Users,
} from 'lucide-react'
import { IMAGES } from '../../../config/images.config'

interface OrgResult {
  name: string; slug: string; logo_url?: string; theme_color?: string
}

const FOOTER_LINKS = {
  Product: [
    { label: 'How it works',       to: '/how-it-works' },
    { label: 'Features',           to: '/features'     },
    { label: 'Pricing',            to: '/pricing'      },
  ],
  Company: [
    { label: 'About us',           to: '/about'        },
    { label: 'Contact',            to: '/contact'      },
  ],
  Legal: [
    { label: 'Privacy Policy',     to: '/privacy'      },
    { label: 'Terms & Conditions', to: '/terms'        },
    { label: 'Security',           to: '/security'     },
  ],
}

// ── Search ────────────────────────────────────────────────────────────────────

function OrgSearch() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<OrgResult[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive]   = useState(-1)
  const navigate              = useNavigate()
  const wrapRef               = useRef<HTMLDivElement>(null)
  const debounce              = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const search = (q: string) => {
    setQuery(q); setActive(-1)
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/org/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(data.results || [])
        setOpen(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 220)
  }

  const go = (slug: string) => navigate(`/${slug}`)

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { if (active >= 0) go(results[active].slug); else if (results[0]) go(results[0].slug) }
    if (e.key === 'Escape')    { setOpen(false); setActive(-1) }
  }

  const hasDropdown = open && (results.length > 0 || (query.trim() && !loading))

  return (
    <div ref={wrapRef} className="relative w-full max-w-[540px]">
      <div className={`flex items-center gap-3 pl-4 pr-2 py-2 transition-all duration-200 shadow-md ${
        hasDropdown
          ? 'bg-white border border-violet-300 border-b-transparent rounded-t-2xl shadow-lg'
          : 'bg-white border border-slate-200 rounded-2xl hover:border-violet-300 hover:shadow-violet-100'
      }`}>
        <Search className="w-4 h-4 text-violet-400 flex-shrink-0" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search for a space or company…"
          className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 text-sm outline-none font-medium"
          autoFocus
        />
        {loading && <span className="w-4 h-4 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin flex-shrink-0" />}
        <button
          type="button"
          className="bg-gradient-to-r from-violet-600 to-teal-500 hover:opacity-90 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex-shrink-0"
        >
          Search
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 bg-white border border-violet-300 border-t-0 rounded-b-2xl overflow-hidden z-50 divide-y divide-slate-100 shadow-2xl">
          {results.map((org, i) => (
            <button key={org.slug} onClick={() => go(org.slug)} onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${i === active ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden"
                style={{ backgroundColor: org.theme_color || '#7c3aed' }}>
                {org.logo_url ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" /> : org.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{org.name}</p>
                <p className="text-xs text-slate-400">@{org.slug}</p>
              </div>
              <span className="text-xs text-violet-600 font-medium flex items-center gap-1 flex-shrink-0">
                Open chat <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 bg-white border border-violet-300 border-t-0 rounded-b-2xl px-5 py-4 text-sm text-slate-500 z-50 shadow-2xl">
          No spaces found for "<span className="text-slate-800 font-medium">{query}</span>"
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Homepage4() {
  return (
    <div className="flex flex-col min-h-screen text-slate-800 bg-white overflow-x-hidden"
      style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}>

      {/* ── Navbar ───────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-4 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-9 h-9 rounded-xl object-cover shadow-sm" />
          <span className="font-extrabold text-slate-900 tracking-tight">SUPPORT247.chat</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-500">
          <Link to="/how-it-works" className="hover:text-violet-700 transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-violet-700 transition-colors">Features</Link>
          <Link to="/pricing"      className="hover:text-violet-700 transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/app/login" className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 transition-colors">
            Sign in
          </Link>
          <Link to="/app/login?tab=register"
            className="text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-teal-500 hover:opacity-90 px-5 py-2.5 rounded-xl transition-all shadow-md shadow-violet-200 active:scale-95">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative px-6 md:px-12 py-24 min-h-[calc(100vh-68px)] flex items-center overflow-hidden
        bg-gradient-to-br from-slate-50 via-violet-50/50 to-teal-50/40">

        {/* Soft glow blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-5%] right-[-5%] w-[500px] h-[500px] rounded-full bg-violet-200/30 blur-[100px]" />
          <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] rounded-full bg-teal-200/30 blur-[100px]" />
        </div>

        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">

          {/* Left — copy + search */}
          <div className="flex flex-col items-start">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-100 border border-violet-200 text-violet-700 text-xs font-bold mb-7 tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" />
              AI-powered multi-agent support
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[58px] font-extrabold text-slate-900 leading-[1.1] tracking-tight mb-6">
              Your customers deserve<br />
              <span className="bg-gradient-to-r from-violet-600 to-teal-500 bg-clip-text text-transparent">
                instant, smart support
              </span>
            </h1>

            <p className="text-lg text-slate-600 leading-relaxed mb-10 max-w-lg">
              Build an AI support team in minutes. Upload your docs, configure agents, and go live — no engineers needed.
            </p>

            <OrgSearch />

            {/* Trust row */}
            <div className="flex items-center gap-6 mt-9 flex-wrap">
              {[
                { icon: Zap,   label: 'Live in minutes'     },
                { icon: Clock, label: '24/7 availability'   },
                { icon: Users, label: 'Multi-agent routing' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Icon className="w-4 h-4 text-teal-500 flex-shrink-0" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right — chat preview mockup */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="w-[340px] bg-white rounded-3xl shadow-2xl shadow-violet-100 border border-slate-100 overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-600 to-teal-500">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white text-base font-bold">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Support Agent</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] text-white/80 font-medium">Online now</span>
                  </div>
                </div>
              </div>
              {/* Chat bubbles */}
              <div className="px-4 py-5 space-y-3 bg-slate-50">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-700 shadow-sm max-w-[220px]">
                    Hi! I'm your support agent. How can I help you today?
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-violet-600 to-teal-500 rounded-2xl rounded-tr-sm px-4 py-3 text-xs text-white max-w-[200px]">
                    What's your return policy?
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-700 shadow-sm max-w-[220px]">
                    We offer a 30-day hassle-free return on all items. I found this from your policy doc.
                  </div>
                </div>
                {/* Typing indicator */}
                <div className="flex gap-2.5 items-end">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
              {/* Input row */}
              <div className="flex items-center gap-2 px-4 py-3.5 border-t border-slate-100 bg-white">
                <input readOnly placeholder="Type your message…" className="flex-1 text-xs text-slate-400 outline-none bg-transparent" />
                <button className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      <section className="bg-white border-y border-slate-100 py-8 px-6 md:px-12">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: '< 1s',   label: 'Intent routing'     },
            { value: '24/7',   label: 'Always online'      },
            { value: 'RAG',    label: 'Doc-cited answers'  },
            { value: '5 min',  label: 'Setup time'         },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center text-center">
              <p className="text-2xl font-extrabold bg-gradient-to-r from-violet-600 to-teal-500 bg-clip-text text-transparent">
                {value}
              </p>
              <p className="text-xs font-semibold text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-teal-600 uppercase tracking-[0.3em] mb-3">Platform Capabilities</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Everything your support team needs
            </h2>
            <p className="text-slate-500 text-base max-w-md mx-auto">
              One platform. Multiple agents. Zero tickets dropped.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Bot,
                gradient: 'from-violet-500 to-indigo-500',
                bg: 'bg-violet-50',
                border: 'border-violet-100',
                title: 'Smart Multi-Agent Routing',
                desc: 'A triage agent reads every incoming message and routes it to the right specialist — billing, technical, logistics, or your custom agents. Happens in under a second.',
                tag: 'Routing < 1s',
                tagColor: 'text-violet-600 bg-violet-50 border-violet-200',
              },
              {
                icon: Shield,
                gradient: 'from-teal-500 to-emerald-500',
                bg: 'bg-teal-50',
                border: 'border-teal-100',
                title: 'RAG-Powered Knowledge Base',
                desc: 'Agents don\'t guess — they read your uploaded documents. PDF, DOCX, TXT support. Every answer cites the exact source so customers trust the response.',
                tag: 'Source citations',
                tagColor: 'text-teal-600 bg-teal-50 border-teal-200',
              },
              {
                icon: BarChart3,
                gradient: 'from-indigo-500 to-blue-500',
                bg: 'bg-indigo-50',
                border: 'border-indigo-100',
                title: 'Live Analytics Dashboard',
                desc: 'Track message volume, RAG hit rate, agent utilization, and resolution trends from a single dashboard. No more digging through logs.',
                tag: 'Real-time metrics',
                tagColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
              },
            ].map(({ icon: Icon, gradient, bg, border, title, desc, tag, tagColor }) => (
              <div key={title}
                className={`group p-8 rounded-3xl ${bg} border ${border} hover:shadow-lg hover:shadow-violet-100/50 transition-all flex flex-col gap-5`}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
                </div>
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${tagColor} self-start`}>
                  <CheckCircle2 className="w-3 h-3" /> {tag}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works — numbered steps ────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-gradient-to-br from-violet-600 to-teal-500 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-white/60 uppercase tracking-[0.3em] mb-3">Simple Setup</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              Live in three steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: '1',
                title: 'Upload your docs',
                desc: 'Add PDFs, Word docs, or paste text. Your agent learns everything in seconds.',
              },
              {
                num: '2',
                title: 'Configure your agent',
                desc: 'We auto-generate a system prompt from your content. Review and launch with one click.',
              },
              {
                num: '3',
                title: 'Share the link',
                desc: 'Get a custom URL to share directly, or embed the chat widget on any page.',
              },
            ].map(({ num, title, desc }) => (
              <div key={num} className="flex flex-col items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-2xl font-extrabold text-white shadow-inner">
                  {num}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1.5">{title}</h3>
                  <p className="text-sm text-white/70 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations ─────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-teal-600 uppercase tracking-[0.3em] mb-3">Integrations</p>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Connect where your customers are
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Globe,       title: 'Website Embed',          desc: 'Add a chat widget to any page with a single script tag.' },
              { icon: MessageSquare, title: 'WhatsApp Business',    desc: 'Let customers chat via WhatsApp — agents handle it all.' },
              { icon: ShoppingBag, title: 'Shopify',                desc: 'Sync your catalog, inventory, and orders automatically.' },
              { icon: Layers,      title: 'Ecommerce',              desc: 'WooCommerce, Magento, and custom checkout integrations.' },
              { icon: ShieldCheck, title: 'Support Desks',          desc: 'Escalate to Salesforce or Zendesk when humans are needed.' },
              { icon: Home,        title: 'Real Estate CRMs',       desc: 'Automate listing questions from any property platform.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title}
                className="flex gap-4 p-5 rounded-2xl bg-white border border-slate-100 hover:border-violet-200 hover:shadow-md hover:shadow-violet-50 transition-all">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-teal-100 border border-violet-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold mb-7">
            <CheckCircle2 className="w-3.5 h-3.5" /> No credit card required
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-5 tracking-tight">
            Start supporting customers smarter
          </h2>
          <p className="text-slate-500 text-base mb-10 max-w-md mx-auto leading-relaxed">
            Free tier includes everything you need. Upgrade when you're ready to scale.
          </p>
          <Link to="/app/login?tab=register"
            className="inline-flex items-center gap-2.5 bg-gradient-to-r from-violet-600 to-teal-500 hover:opacity-90 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all shadow-lg shadow-violet-200 hover:shadow-violet-300 active:scale-95">
            Create free account <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-slate-50 px-6 md:px-12 pt-14 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-3">
                <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover" />
                <span className="text-slate-900 font-extrabold text-sm">SUPPORT247.chat</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">AI-powered multi-agent support for modern businesses.</p>
            </div>
            {Object.entries(FOOTER_LINKS).map(([group, links]) => (
              <div key={group}>
                <p className="text-slate-900 text-xs font-extrabold uppercase tracking-widest mb-4">{group}</p>
                <ul className="space-y-2.5">
                  {links.map(({ label, to }) => (
                    <li key={label}>
                      <Link to={to} className="text-xs text-slate-500 hover:text-slate-800 transition-colors">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link to="/privacy" className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Privacy</Link>
              <Link to="/terms"   className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Terms</Link>
              <Link to="/cookies" className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
