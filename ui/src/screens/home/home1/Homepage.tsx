import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Search, ArrowRight, Sparkles, CheckCircle2, Globe, MessageSquare, ShoppingBag, Layers, ShieldCheck, Home } from 'lucide-react'
import { IMAGES } from '../../../config/images.config'

interface OrgResult {
  name: string; slug: string; logo_url?: string; theme_color?: string
}

const FOOTER_LINKS = {
  Product: [
    { label: 'How it works',       to: '/how-it-works' },
    { label: 'What we do',         to: '/what-we-do'   },
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
    { label: 'Cookie Policy',      to: '/cookies'      },
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
    <div ref={wrapRef} className="relative w-full max-w-[560px]">
      <div className={`flex items-center gap-3 px-5 py-4 transition-all duration-200 ${
        hasDropdown
          ? 'bg-[#181b28] border border-indigo-500/40 border-b-transparent rounded-t-2xl'
          : 'bg-[#181b28] border border-white/10 rounded-2xl hover:border-indigo-500/40'
      }`}>
        <Search className="w-5 h-5 text-indigo-400 flex-shrink-0" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search for an organization…"
          className="flex-1 bg-transparent text-white placeholder-gray-500 text-[15px] outline-none"
          autoFocus
        />
        {loading && <span className="w-4 h-4 border-2 border-indigo-800 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 bg-[#181b28] border border-indigo-500/40 border-t-0 rounded-b-2xl overflow-hidden z-50 divide-y divide-white/5">
          {results.map((org, i) => (
            <button key={org.slug} onClick={() => go(org.slug)} onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${i === active ? 'bg-indigo-600/20' : 'hover:bg-white/5'}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden"
                style={{ backgroundColor: org.theme_color || '#6366f1' }}>
                {org.logo_url
                  ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                  : org.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{org.name}</p>
                <p className="text-xs text-gray-500">@{org.slug}</p>
              </div>
              <span className="text-xs text-indigo-400 font-medium flex items-center gap-1 flex-shrink-0">
                Open chat <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 bg-[#181b28] border border-indigo-500/40 border-t-0 rounded-b-2xl px-5 py-4 text-sm text-gray-500 z-50">
          No organizations found for "<span className="text-gray-300">{query}</span>"
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Homepage1() {
  return (
    <div className="flex flex-col" style={{
      background: '#0d0f1c',
      fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif",
    }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-8 py-5 border-b border-white/5"
        style={{ background: 'rgba(13,15,28,0.80)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-9 h-9 rounded-lg object-cover shadow-lg shadow-violet-500/30" />
          <span className="font-bold text-white tracking-tight">SUPPORT247.chat</span>
        </div>
        <div className="hidden md:flex items-center gap-7 text-sm text-gray-400">
          <Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-white transition-colors">Features</Link>
          <Link to="/about"        className="hover:text-white transition-colors">About</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/app/login" className="text-sm text-gray-400 hover:text-white font-medium px-3 py-1.5 transition-colors">
            Sign in
          </Link>
          <Link to="/app/login?tab=register"
            className="text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/25">
            Sign up free
          </Link>
        </div>
      </nav>

      {/* ── Hero — full viewport height ────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-[calc(100vh-65px)] px-6 text-center overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0d0f1c 0%, #111326 55%, #0f1020 100%)' }}>

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px]"
            style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 40%, transparent 65%)' }} />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[150px]"
            style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.05) 0%, transparent 70%)' }} />
        </div>

        {/* Faint grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 flex flex-col items-center gap-0">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-semibold mb-10">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            AI-powered customer support platform
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl lg:text-[76px] font-bold text-white leading-[1.05] tracking-tight mb-7 max-w-3xl">
            Find your{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              support team
            </span>
          </h1>

          <p className="text-gray-400 text-lg md:text-xl leading-relaxed mb-14 max-w-lg">
            Search any organization and chat with their AI support agents — intelligent, instant, available 24/7.
          </p>

          <OrgSearch />

          <p className="text-xs text-gray-600 mt-5 flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-white/6 text-gray-500 font-mono text-[11px] border border-white/10">↑↓</kbd>
            navigate
            <span className="text-gray-700">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/6 text-gray-500 font-mono text-[11px] border border-white/10">↵</kbd>
            open chat
          </p>
        </div>

        {/* Scroll nudge */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-gray-600 animate-bounce">
          <span className="text-[11px] tracking-widest uppercase">Scroll</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── Platform capabilities — visible on scroll ─────────────────────── */}
      <section id="features" className="px-8 py-28 border-t border-white/5" style={{ background: '#0f1120' }}>
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-20">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-[0.25em] mb-4">Platform capabilities</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Everything you need to scale support</h2>
            <p className="text-gray-500 max-w-lg mx-auto">One platform. Multiple agents. Zero dropped tickets.</p>
          </div>

          {/* Feature rows — alternating layout, no cards */}
          <div className="space-y-20">
            {[
              {
                num: '01',
                title: 'Smart multi-agent routing',
                desc: 'Every incoming message is read by a triage agent that classifies intent and hands off to the most qualified specialist — finance, logistics, technical support, or any custom agent you configure. Routing happens in under a second, invisibly.',
                points: ['Intent classification in < 1s', 'Finance, logistics, tech & custom agents', 'Fallback to triage when uncertain'],
                accent: 'from-indigo-500 to-violet-500',
                flip: false,
              },
              {
                num: '02',
                title: 'RAG-powered knowledge base',
                desc: 'Agents don\'t guess — they read your documents. Upload manuals, policies, and FAQs. Our pipeline embeds and indexes every page so agents retrieve exact excerpts and cite sources in every response.',
                points: ['PDF, DOCX, plain text support', 'Source citations in every answer', 'Per-agent document scoping'],
                accent: 'from-violet-500 to-purple-500',
                flip: true,
              },
              {
                num: '03',
                title: 'Real-time analytics & insights',
                desc: 'A live dashboard surfaces message volume, RAG hit rate, resolution trends, agent utilization, and recent activity — giving you the data to continuously improve without digging through logs.',
                points: ['Live message & session metrics', 'RAG hit rate tracking', 'Per-agent performance breakdown'],
                accent: 'from-purple-500 to-pink-500',
                flip: false,
              },
            ].map(({ num, title, desc, points, accent, flip }) => (
              <div key={num} className={`flex flex-col md:flex-row gap-12 items-center ${flip ? 'md:flex-row-reverse' : ''}`}>

                {/* Big number side */}
                <div className="flex-shrink-0 flex flex-col items-center md:items-start gap-2 md:w-48">
                  <span className={`text-[90px] leading-none font-black bg-gradient-to-br ${accent} bg-clip-text text-transparent opacity-20 select-none`}>
                    {num}
                  </span>
                </div>

                {/* Text side */}
                <div className="flex-1">
                  <div className={`inline-block h-0.5 w-10 bg-gradient-to-r ${accent} rounded mb-4`} />
                  <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
                  <p className="text-gray-400 leading-relaxed mb-6 text-[15px]">{desc}</p>
                  <ul className="space-y-2.5">
                    {points.map(p => (
                      <li key={p} className="flex items-center gap-2.5 text-sm text-gray-300">
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 bg-gradient-to-br ${accent} rounded-full`} style={{ color: 'white' }} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-8 py-28 border-t border-white/5" style={{ background: '#0d0f1c' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-[0.25em] mb-4">Get started</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple Setup Checklist</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
            {[
              { step: '1', color: 'from-indigo-500 to-indigo-600', title: 'Upload PDF Documents', desc: 'Upload the pdf documents to knowledge which contains details about the support products or steps to what is required to be done.' },
              { step: '2', color: 'from-violet-500 to-violet-600', title: 'Create Agent', desc: 'Create agent to configure specialized capabilities and assign them to your knowledge bases.' },
              { step: '3', color: 'from-purple-500 to-purple-600', title: 'Share Link', desc: 'Share the chatbot shareable link to embed on your website or message directly.' },
            ].map(({ step, color, title, desc }) => (
              <div key={step} className="flex flex-col p-8 gap-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white text-base font-bold shadow-lg flex-shrink-0`}>
                  {step}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations Section ───────────────────────────────────────────── */}
      <section className="px-8 py-28 border-t border-white/5 bg-[#0f1120]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-[0.25em] mb-4">Integrations</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Connect to your favorite channels</h2>
            <p className="text-gray-500 max-w-lg mx-auto">Deploy your chatbot across multiple environments with a single click.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Globe, title: 'Website Embed', desc: 'Add support instantly to any landing page using a simple, lightweight script snippet.' },
              { icon: MessageSquare, title: 'WhatsApp Business', desc: 'Link your custom agent directly to WhatsApp to answer client queries on the go.' },
              { icon: ShoppingBag, title: 'Shopify Integration', desc: 'Synchronize your online shop catalog details, inventories, and active orders.' },
              { icon: Layers, title: 'Ecommerce Integrations', desc: 'Connect easily with WooCommerce, Magento, or custom backend checkout systems.' },
              { icon: ShieldCheck, title: 'Customer Support Desk', desc: 'Directly escalate tickets and synchronize support queries with Salesforce or Zendesk.' },
              { icon: Home, title: 'Realtor Hubs', desc: 'Connect to real estate CRM platforms to automate listing answers and inquiries.' },
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-[#181b28]/60 border border-white/5 hover:border-indigo-500/20 transition-all flex flex-col gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1.5">{item.title}</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="px-8 pb-28 border-t border-white/5 bg-[#0d0f1c]">
        <div className="max-w-5xl mx-auto pt-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Ready to get started?</h2>
          <p className="text-gray-500 mb-10 text-base max-w-md mx-auto">Set up your support org in minutes. No credit card required.</p>
          <Link to="/app/login?tab=register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-500/25 text-sm">
            Create free account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 text-gray-500 px-8 pt-14 pb-8"
        style={{ background: '#07080f' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-7 h-7 rounded-md object-cover" />
                <span className="text-white font-semibold text-sm">SUPPORT247.chat</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-600">AI-powered multi-agent support for modern businesses.</p>
            </div>
            {Object.entries(FOOTER_LINKS).map(([group, links]) => (
              <div key={group}>
                <p className="text-white text-xs font-semibold uppercase tracking-wider mb-4">{group}</p>
                <ul className="space-y-2.5">
                  {links.map(({ label, to }) => (
                    <li key={label}>
                      <Link to={to} className="text-xs text-gray-600 hover:text-gray-300 transition-colors">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-700">© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link to="/privacy" className="text-xs text-gray-700 hover:text-gray-400 transition-colors">Privacy</Link>
              <Link to="/terms"   className="text-xs text-gray-700 hover:text-gray-400 transition-colors">Terms</Link>
              <Link to="/cookies" className="text-xs text-gray-700 hover:text-gray-400 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
