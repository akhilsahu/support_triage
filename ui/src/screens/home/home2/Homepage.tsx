import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Search, ArrowRight, Sparkles, CheckCircle2, Bot, Shield, BarChart3, ArrowUpRight, Globe, MessageSquare, ShoppingBag, Layers, ShieldCheck, Home } from 'lucide-react'
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

// ── Search Component ──────────────────────────────────────────────────────────
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
    <div ref={wrapRef} className="relative w-full max-w-[520px]">
      <div className={`flex items-center gap-3 px-5 py-4 transition-all duration-300 ${
        hasDropdown
          ? 'bg-slate-900/90 border border-violet-500/50 border-b-transparent rounded-t-2xl shadow-xl shadow-violet-500/5 backdrop-blur-md'
          : 'bg-slate-900/60 border border-white/10 rounded-2xl hover:border-violet-500/40 hover:bg-slate-900/80 shadow-lg backdrop-blur-md'
      }`}>
        <Search className="w-5 h-5 text-indigo-400 flex-shrink-0" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search space, workspace or team..."
          className="flex-1 bg-transparent text-white placeholder-slate-400 text-[15px] outline-none"
          autoFocus
        />
        {loading && <span className="w-4 h-4 border-2 border-indigo-800 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 bg-slate-900/95 border border-violet-500/50 border-t-0 rounded-b-2xl overflow-hidden z-50 divide-y divide-white/5 shadow-2xl backdrop-blur-md">
          {results.map((org, i) => (
            <button key={org.slug} onClick={() => go(org.slug)} onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${i === active ? 'bg-violet-600/20' : 'hover:bg-white/5'}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden"
                style={{ backgroundColor: org.theme_color || '#6366f1' }}>
                {org.logo_url
                  ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                  : org.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{org.name}</p>
                <p className="text-xs text-slate-400">@{org.slug}</p>
              </div>
              <span className="text-xs text-indigo-400 font-medium flex items-center gap-1 flex-shrink-0">
                Open space <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 bg-slate-900/95 border border-violet-500/50 border-t-0 rounded-b-2xl px-5 py-4 text-sm text-slate-400 z-50 backdrop-blur-md">
          No spaces found for "<span className="text-slate-200 font-medium">{query}</span>"
        </div>
      )}
    </div>
  )
}

// ── Floating Agent Capsule ───────────────────────────────────────────────────
function FloatingAgent({ icon, name, status, color, delay, pos }: {
  icon: string; name: string; status: string; color: string; delay: string; pos: string
}) {
  return (
    <div className={`absolute ${pos} transform transition-all duration-500 hover:scale-105 select-none`}
      style={{
        animation: `float-slow 6s ease-in-out infinite alternate`,
        animationDelay: delay
      }}
    >
      <div className={`flex items-center gap-3.5 p-4 rounded-2xl bg-slate-900/80 border border-white/10 shadow-2xl backdrop-blur-md`}>
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-lg shadow-inner`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-semibold text-white tracking-wide">{name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{status}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page Component ────────────────────────────────────────────────────────
export function Homepage2() {
  return (
    <div className="flex flex-col min-h-screen text-slate-100 overflow-x-hidden" style={{
      background: '#090a15',
      fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif",
    }}>
      {/* CSS Keyframes Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes float-slow {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-15px) rotate(1deg); }
        }
        @keyframes pulse-subtle {
          0% { opacity: 0.3; }
          100% { opacity: 0.6; }
        }
      `}} />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5 backdrop-blur-md bg-[#090a15]/75">
        <div className="flex items-center gap-3">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-md shadow-violet-500/20" />
          <span className="font-bold text-white tracking-tight text-sm md:text-base">SUPPORT247.chat</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wider uppercase text-slate-400">
          <Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-white transition-colors">Features</Link>
          <Link to="/pricing"      className="hover:text-white transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/app/login" className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white px-3 py-1.5 transition-colors">
            Sign in
          </Link>
          <Link to="/app/login?tab=register"
            className="text-xs uppercase font-semibold tracking-widest bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero Split Layout ──────────────────────────────────────────────── */}
      <section className="relative flex items-center min-h-[calc(100vh-70px)] px-6 md:px-12 py-16 overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[130px] animate-pulse-subtle" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
        </div>

        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          {/* Left Column: Headline, Description, Search */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold mb-6">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Dynamic Multi-Agent Platform
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] mb-6">
              Connect directly <br />
              to your AI{' '}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Support Space
              </span>
            </h1>

            <p className="text-slate-400 text-base md:text-lg mb-10 max-w-lg leading-relaxed">
              Find any registered space to chat with their customized fleet of support agents. Experience intelligent routing, prompt skills, and active RAG sync.
            </p>

            <OrgSearch />

            <div className="flex items-center gap-6 mt-12 text-slate-500 text-[11px] font-semibold tracking-wider uppercase">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Multi-Agent Routing
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Active RAG Sync
              </span>
            </div>
          </div>

          {/* Right Column: Floating Agent capsules preview */}
          <div className="lg:col-span-6 relative h-[450px] w-full hidden lg:block select-none">
            {/* Background grid */}
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1.5px,transparent_1.5px)] [background-size:24px_24px] rounded-3xl border border-white/5 bg-[#090b16]/30 backdrop-blur-[2px] shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/10 to-transparent pointer-events-none" />
              
              {/* Pulsing center orbit */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-violet-500/10 animate-ping opacity-25" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full border border-indigo-500/5" />
            </div>

            {/* Capsules */}
            <FloatingAgent
              icon="🧭"
              name="Triage Specialist"
              status="routing queries"
              color="from-indigo-600 to-indigo-500"
              delay="0s"
              pos="top-[10%] left-[10%]"
            />

            <FloatingAgent
              icon="🛠️"
              name="Technical Support"
              status="scanning docs"
              color="from-violet-600 to-violet-500"
              delay="1.5s"
              pos="top-[35%] right-[8%]"
            />

            <FloatingAgent
              icon="💳"
              name="Billing & Accounts"
              status="ready"
              color="from-cyan-600 to-cyan-500"
              delay="0.7s"
              pos="bottom-[12%] left-[18%]"
            />

            <FloatingAgent
              icon="🚀"
              name="Delivery Specialist"
              status="active"
              color="from-fuchsia-600 to-fuchsia-500"
              delay="2.2s"
              pos="bottom-[38%] left-[55%]"
            />
          </div>
        </div>
      </section>

      {/* ── Bento Grid Features ────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 border-t border-white/5 bg-slate-950/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase font-extrabold text-violet-400 tracking-[0.25em] mb-3">Platform Superpowers</h2>
            <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Everything you need to automate support</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-violet-500/20 transition-all group flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition-transform">
                  <Bot className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Smart Intent Classification</h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Incoming questions are instantly parsed by a centralized triage agent and instantly delegated to specialized bots.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-1.5 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Classification &lt;1s <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-violet-500/20 transition-all group flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Knowledge retrieval with citations</h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Connect space documents directly to agent RAG configurations. Agents reference exactly where they found their answers.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-1.5 text-xs font-semibold text-violet-400 uppercase tracking-wider">
                Full PDF/TXT parsing <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-violet-500/20 transition-all group flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Live Activity Metrics</h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Track user sentiment, latency, agent load, and RAG search accuracy directly from an unified control dashboard.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-1.5 text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                Real-time tracking <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Steps Timeline ─────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 border-t border-white/5 bg-slate-950/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase font-extrabold text-indigo-400 tracking-[0.25em] mb-3">Simple Setup</h2>
            <h3 className="text-3xl font-bold text-white tracking-tight">Deploy your Space in 3 steps</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '01', title: 'Upload PDF Documents', desc: 'Upload the pdf documents to knowledge which contains details about the support products or steps to what is required to be done.' },
              { num: '02', title: 'Create Agent', desc: 'Create agent to configure custom prompts, workflows, and intent classification models.' },
              { num: '03', title: 'Share Chatbot Link', desc: 'Share the chatbot shareable link to embed widgets on your site or share direct URLs.' }
            ].map((s, idx) => (
              <div key={idx} className="relative p-8 rounded-3xl bg-slate-900/30 border border-white/5 flex flex-col justify-between">
                <div className="text-5xl font-black text-white/5 absolute top-4 right-6">{s.num}</div>
                <div>
                  <h4 className="text-base font-extrabold text-white mb-2">{s.title}</h4>
                  <p className="text-slate-400 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations Section ───────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 border-t border-white/5 bg-[#090a15]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase font-extrabold text-violet-400 tracking-[0.25em] mb-3">Integrations</h2>
            <h3 className="text-3xl font-bold text-white tracking-tight">Connect with your favorite platforms</h3>
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
              <div key={idx} className="p-6 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-violet-500/20 transition-all group flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-violet-650/10 border border-violet-500/20 flex items-center justify-center text-violet-450 mb-4 group-hover:scale-105 transition-transform">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1.5">{item.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Floating CTA ───────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20 bg-[#090a15] relative overflow-hidden flex flex-col items-center">
        <div className="max-w-4xl mx-auto w-full p-12 rounded-3xl bg-gradient-to-r from-violet-950/20 to-indigo-950/20 border border-white/10 flex flex-col items-center justify-center text-center relative z-10 backdrop-blur-xl">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Deploy your customer support agents today</h2>
          <p className="text-slate-400 text-xs md:text-sm mb-8 max-w-sm">No credit card required. Free tier includes full multi-agent support setup.</p>
          <Link to="/app/login?tab=register"
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-600/30 active:scale-95">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 text-slate-500 px-6 md:px-12 py-12 bg-slate-950/60">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-7 h-7 rounded-md object-cover" />
                <span className="text-white font-semibold text-xs tracking-wider">SUPPORT247.chat</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">Autonomous multi-agent customer chat platform.</p>
            </div>
            {Object.entries(FOOTER_LINKS).map(([group, links]) => (
              <div key={group}>
                <p className="text-white text-[10px] font-extrabold uppercase tracking-widest mb-4">{group}</p>
                <ul className="space-y-2">
                  {links.map(({ label, to }) => (
                    <li key={label}>
                      <Link to={to} className="text-xs text-slate-500 hover:text-slate-350 transition-colors">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px]">
            <p className="text-slate-600">© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link to="/privacy" className="text-slate-600 hover:text-slate-400 transition-colors">Privacy</Link>
              <Link to="/terms"   className="text-slate-600 hover:text-slate-400 transition-colors">Terms</Link>
              <Link to="/cookies" className="text-slate-600 hover:text-slate-400 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
