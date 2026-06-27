import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Search, ArrowRight, Sparkles, CheckCircle2, Bot, Link2, TrendingUp, Globe, MessageSquare, ShoppingBag, Layers, ShieldCheck, Home } from 'lucide-react'
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
    <div ref={wrapRef} className="relative w-full max-w-[460px]">
      <div className={`flex items-center gap-2.5 pl-4 pr-1.5 py-1.5 transition-all duration-300 ${
        hasDropdown
          ? 'bg-white border border-amber-500/40 border-b-transparent rounded-t-2xl shadow-lg'
          : 'bg-white border border-amber-200/60 rounded-2xl hover:border-amber-400/80 hover:bg-white shadow-sm'
      }`}>
        <Search className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search brand or team name..."
          className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 text-sm outline-none font-semibold min-w-0"
          autoFocus
        />
        {loading && <span className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin flex-shrink-0 mr-1.5" />}
        <button
          type="button"
          className="bg-gradient-to-r from-amber-600 to-rose-500 hover:opacity-95 text-white text-xs uppercase font-extrabold tracking-widest px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 flex-shrink-0"
        >
          Search
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 bg-white border border-amber-200/80 border-t-0 rounded-b-2xl overflow-hidden z-50 divide-y divide-slate-100 shadow-2xl">
          {results.map((org, i) => (
            <button key={org.slug} onClick={() => go(org.slug)} onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${i === active ? 'bg-amber-50/50' : 'hover:bg-slate-50'}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden"
                style={{ backgroundColor: org.theme_color || '#d97706' }}>
                {org.logo_url
                  ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                  : org.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{org.name}</p>
                <p className="text-xs text-slate-500">@{org.slug}</p>
              </div>
              <span className="text-xs text-amber-600 font-semibold flex items-center gap-1 flex-shrink-0">
                Open chat <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 bg-white border border-amber-200/80 border-t-0 rounded-b-2xl px-5 py-4 text-sm text-slate-500 z-50 shadow-2xl">
          No brands found matching "<span className="text-slate-800 font-medium">{query}</span>"
        </div>
      )}
    </div>
  )
}

// ── Main Page Component ────────────────────────────────────────────────────────
export function Homepage3() {
  return (
    <div className="flex flex-col min-h-screen text-slate-800 bg-[#FAF7F0] overflow-x-hidden" style={{
      fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif",
    }}>
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-5 border-b border-amber-200/30 bg-[#FAF7F0]/85 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-sm shadow-amber-500/10" />
          <span className="font-extrabold text-slate-900 tracking-tight text-sm md:text-base">SUPPORT247.chat</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-wider uppercase text-slate-500">
          <Link to="/how-it-works" className="hover:text-amber-700 transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-amber-700 transition-colors">Features</Link>
          <Link to="/pricing"      className="hover:text-amber-700 transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/app/login" className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 px-3 py-1.5 transition-colors">
            Sign in
          </Link>
          <Link to="/app/login?tab=register"
            className="text-xs uppercase font-extrabold tracking-widest bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 hover:opacity-95 text-white px-5 py-2.5 rounded-xl transition-all shadow-md active:scale-95">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero Split Layout ──────────────────────────────────────────────── */}
      <section className="relative flex items-center min-h-[calc(100vh-70px)] px-6 md:px-12 py-16 overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-amber-400/10 blur-[130px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-rose-400/10 blur-[120px]" />
        </div>

        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start relative z-10">
          {/* Left Column: Headline, Description, Search */}
          <div className="lg:col-span-7 flex flex-col items-start text-left pt-2 md:pt-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.08] mb-6">
              Connect directly <br />
              to your favorite <br />
              <span className="bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 bg-clip-text text-transparent">
                Customer Space
              </span>
            </h1>

            <p className="text-slate-700 text-base md:text-lg mb-8 max-w-lg leading-relaxed font-semibold">
              Find any brand, team, or workspace to start chatting instantly.
              <span className="block text-slate-500 text-xs md:text-sm font-medium mt-3 leading-relaxed">
                Simple customer-oriented support that is always online and ready to help. No complex setup or technical jargon.
              </span>
            </p>

            <OrgSearch />
          </div>

          {/* Right Column: Visual illustration without card frames, aligned to the top */}
          <div className="lg:col-span-5 relative w-full hidden lg:flex flex-col justify-start select-none pl-6 pr-6 pt-10 md:pt-14">
            <div className="space-y-8 max-w-[340px]">
              {/* Point 1 */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-700 flex-shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">5-Second Chatbot Setup</h4>
                  <p className="text-xs text-slate-550 mt-0.5 leading-relaxed font-medium">Go from zero to active chatbot in under five seconds. Easy, straightforward, and instantly ready.</p>
                </div>
              </div>

              {/* Point 2 */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-700 flex-shrink-0">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Your Own Tailored Link</h4>
                  <p className="text-xs text-slate-550 mt-0.5 leading-relaxed font-medium">Get a clean custom subdomain link matching your name or company needs perfectly.</p>
                </div>
              </div>

              {/* Point 3 */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-700 flex-shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Live Sales Tracking</h4>
                  <p className="text-xs text-slate-550 mt-0.5 leading-relaxed font-medium">See exactly how many chats turn into purchases with simple, real-time analytics graphs.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plain Features — No Cards ──────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 border-t border-amber-200/20 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-xs uppercase font-extrabold text-rose-500 tracking-[0.25em] mb-3">Key Highlights</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vibrant design to grow your business</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Feature 1 */}
            <div className="flex flex-col items-start">
              <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center mb-6">
                <Bot className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">5-Second AI Chat</h4>
              <p className="text-slate-500 text-xs leading-relaxed font-medium">
                Connect your business knowledge files and create an automated answering assistant in under 5 seconds. It is incredibly simple.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col items-start">
              <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center mb-6">
                <Link2 className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Custom Subdomain URL</h4>
              <p className="text-slate-500 text-xs leading-relaxed font-medium">
                Receive an custom direct link tailored specifically to your name, product, or shop name for instant customer access.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col items-start">
              <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center mb-6">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Live Tracking & Analytics</h4>
              <p className="text-slate-500 text-xs leading-relaxed font-medium">
                Get plain, easy-to-read graphs displaying your chat volumes, active sales inquiries, and product engagement instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Steps — High-Contrast Dark Block ───────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-[#12131a] text-white border-t border-b border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase font-extrabold text-amber-500 tracking-[0.25em] mb-3">Simple Steps</h2>
            <h3 className="text-3xl font-extrabold text-white tracking-tight">Deploy your Space in minutes</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
            {[
              { num: '01', title: 'Upload PDF Documents', desc: 'Upload the pdf documents to knowledge which contains details about the support products or steps to what is required to be done.' },
              { num: '02', title: 'Create Agent', desc: 'Create agent to start handling customer conversations instantly.' },
              { num: '03', title: 'Share Chatbot Link', desc: 'Share the chatbot shareable link with your customers directly.' }
            ].map((s, idx) => (
              <div key={idx} className="flex flex-col">
                <div className="text-4xl font-black text-rose-500/30 mb-4">{s.num}</div>
                <h4 className="text-base font-extrabold text-slate-100 mb-2">{s.title}</h4>
                <p className="text-slate-450 text-xs leading-relaxed font-medium">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations Section ───────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-[#FAF7F0] border-b border-amber-200/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xs uppercase font-extrabold text-rose-500 tracking-[0.25em] mb-3">Integrations</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Connect with your favorite platforms</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {[
              { icon: Globe, title: 'Website Embed', desc: 'Add support instantly to any landing page using a simple, lightweight script snippet.' },
              { icon: MessageSquare, title: 'WhatsApp Business', desc: 'Link your custom agent directly to WhatsApp to answer client queries on the go.' },
              { icon: ShoppingBag, title: 'Shopify Integration', desc: 'Synchronize your online shop catalog details, inventories, and active orders.' },
              { icon: Layers, title: 'Ecommerce Integrations', desc: 'Connect easily with WooCommerce, Magento, or custom backend checkout systems.' },
              { icon: ShieldCheck, title: 'Customer Support Desk', desc: 'Directly escalate tickets and synchronize support queries with Salesforce or Zendesk.' },
              { icon: Home, title: 'Realtor Hubs', desc: 'Connect to real estate CRM platforms to automate listing answers and inquiries.' },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-start text-left">
                <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-700 mb-4 flex-shrink-0">
                  <item.icon className="w-5 h-5" />
                </div>
                <h4 className="text-base font-extrabold text-slate-900 mb-2">{item.title}</h4>
                <p className="text-slate-500 text-xs leading-relaxed font-semibold">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-[#FAF7F0] border-t border-amber-200/20 flex flex-col items-center">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-3">Ready to build your custom chat?</h2>
          <p className="text-slate-500 text-xs md:text-sm mb-8 max-w-sm mx-auto font-medium">No credit card required. Free tier includes all basic custom URL options.</p>
          <Link to="/app/login?tab=register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-md active:scale-95">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-amber-200/20 text-slate-500 px-6 md:px-12 py-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-7 h-7 rounded-md object-cover" />
                <span className="text-slate-900 font-extrabold text-xs tracking-wider">SUPPORT247.chat</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">Vibrant multi-agent customer chat platform.</p>
            </div>
            {Object.entries(FOOTER_LINKS).map(([group, links]) => (
              <div key={group}>
                <p className="text-slate-900 text-[10px] font-extrabold uppercase tracking-widest mb-4">{group}</p>
                <ul className="space-y-2">
                  {links.map(({ label, to }) => (
                    <li key={label}>
                      <Link to={to} className="text-xs text-slate-500 hover:text-slate-800 transition-colors">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-amber-200/20 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px]">
            <p className="text-slate-400">© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link to="/privacy" className="text-slate-400 hover:text-slate-600 transition-colors">Privacy</Link>
              <Link to="/terms"   className="text-slate-400 hover:text-slate-600 transition-colors">Terms</Link>
              <Link to="/cookies" className="text-slate-400 hover:text-slate-600 transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
