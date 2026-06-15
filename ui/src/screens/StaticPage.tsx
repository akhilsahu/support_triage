/**
 * Shared layout for all static marketing / legal pages.
 * Adapts to the active homepage theme (homepage1 / homepage2 / homepage3).
 */
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { IMAGES } from '../config/images.config'
import { useAppStore } from '../store/useAppStore'

// ── Theme tokens ──────────────────────────────────────────────────────────────

const FOOTER_LINKS = {
  Product: [
    { label: 'How it works', to: '/how-it-works' },
    { label: 'What we do',   to: '/what-we-do'   },
    { label: 'Features',     to: '/features'     },
    { label: 'Pricing',      to: '/pricing'      },
  ],
  Company: [
    { label: 'About us', to: '/about'   },
    { label: 'Contact',  to: '/contact' },
  ],
  Legal: [
    { label: 'Privacy Policy',     to: '/privacy'  },
    { label: 'Terms & Conditions', to: '/terms'    },
    { label: 'Cookie Policy',      to: '/cookies'  },
    { label: 'Security',           to: '/security' },
  ],
}

const THEMES = {
  homepage1: {
    page:           'bg-[#0d0f1c] text-slate-100',
    font:           "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif",
    navBg:          'sticky top-0 z-40 flex items-center justify-between px-8 py-4 bg-[#0d0f1c]/80 backdrop-blur-md border-b border-white/5',
    logoText:       'font-bold text-white tracking-tight',
    navMidLink:     'text-sm text-gray-400 hover:text-white transition-colors',
    signInLink:     'text-sm text-slate-400 hover:text-white font-medium px-3 py-1.5',
    ctaBtn:         'text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold px-4 py-2 rounded-xl shadow-md shadow-indigo-500/25',
    headerBg:       'bg-[#181b28]/50 border-b border-white/5 px-8 py-16 text-center',
    backLink:       'inline-flex items-center gap-1.5 text-xs text-indigo-400 font-medium mb-6 hover:underline',
    h1:             'text-4xl font-bold text-white mb-3 tracking-tight',
    subtitle:       'text-slate-400 max-w-xl mx-auto text-base',
    contentBg:      'flex-1 px-8 py-12 max-w-3xl mx-auto w-full',
    prose:          'text-slate-300',
    h2:             'text-xl font-bold text-white mt-8',
    strong:         'text-white',
    cardBg:         'bg-[#181b28]/70 border border-white/10',
    accentLink:     'text-indigo-400 hover:underline',
    footerWrap:     'border-t border-white/5 text-gray-500 px-8 pt-14 pb-8 bg-[#07080f]',
    footerTagline:  'text-xs leading-relaxed text-gray-500 font-medium',
    footerColHead:  'text-white text-xs font-semibold uppercase tracking-wider mb-4',
    footerColLink:  'text-xs text-gray-600 hover:text-gray-300 transition-colors',
    footerCopyBd:   'border-white/5',
    footerCopyText: 'text-xs text-gray-700',
    footerCopyLink: 'text-xs text-gray-700 hover:text-gray-400 transition-colors',
    footerBorder:   'border-t border-white/5 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-600',
    footerLink:     'hover:text-slate-300',
    stepIcon:       'bg-gradient-to-br from-indigo-500 to-violet-600',
    stepTitle:      'font-bold text-white mb-1',
    stepBody:       'text-slate-400 text-sm leading-relaxed',
    bullet:         'bg-gradient-to-r from-indigo-500 to-violet-500',
    featTitle:      'font-semibold text-white',
    featDesc:       'text-slate-400',
    featBorder:     'border-b border-white/10 last:border-0',
    pricingHL:      'border-indigo-400/50 shadow-xl shadow-indigo-900/30 bg-[#181b28]',
    pricingNorm:    'border-white/10 bg-[#181b28]/50',
    pricingName:    'text-sm font-semibold text-slate-400 mb-1',
    pricingPrice:   'text-3xl font-bold text-white mb-1',
    pricingDesc:    'text-sm text-slate-400 mb-5',
    pricingFeat:    'text-sm text-slate-300 flex gap-2',
    pricingCheck:   'text-indigo-400',
    pricingCtaHL:   'block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-500/25',
    pricingCtaNorm: 'block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors bg-white/10 text-slate-200 hover:bg-white/15',
    contactCard:    'p-5 rounded-2xl',
    contactLabel:   'text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1',
    contactLink:    'text-sm font-medium text-indigo-400 hover:underline',
    authCard:       'bg-[#181b28]/50 border border-white/10',
    authInput:      'bg-[#181b28] border border-white/10 text-white placeholder-slate-500 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10',
    authBtn:        'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20',
    authBackLink:   'text-slate-500 hover:text-slate-300',
    authHomeBtn:    'bg-[#181b28]/60 border border-white/10 text-slate-400 hover:text-white',
    authCopyright:  'text-slate-600',
    authIconBg:     'bg-gradient-to-tr from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20',
    authLabelText:  'text-slate-350',
    authGlow1:      'bg-indigo-500/10',
    authGlow2:      'bg-violet-500/10',
  },
  homepage2: {
    page:           'bg-[#090a15] text-slate-100',
    font:           "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif",
    navBg:          'sticky top-0 z-40 flex items-center justify-between px-8 py-4 bg-[#090a15]/80 backdrop-blur-md border-b border-white/5',
    logoText:       'font-bold text-white tracking-tight',
    navMidLink:     'text-sm text-gray-400 hover:text-white transition-colors',
    signInLink:     'text-sm text-slate-400 hover:text-white font-medium px-3 py-1.5',
    ctaBtn:         'text-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold px-4 py-2 rounded-xl shadow-lg shadow-indigo-600/20',
    headerBg:       'bg-slate-900/40 border-b border-white/5 px-8 py-16 text-center',
    backLink:       'inline-flex items-center gap-1.5 text-xs text-violet-400 font-medium mb-6 hover:underline',
    h1:             'text-4xl font-bold text-white mb-3 tracking-tight',
    subtitle:       'text-slate-400 max-w-xl mx-auto text-base',
    contentBg:      'flex-1 px-8 py-12 max-w-3xl mx-auto w-full',
    prose:          'text-slate-300',
    h2:             'text-xl font-bold text-white mt-8',
    strong:         'text-white',
    cardBg:         'bg-slate-900/50 border border-white/10',
    accentLink:     'text-violet-400 hover:underline',
    footerWrap:     'border-t border-white/5 text-gray-500 px-8 pt-14 pb-8 bg-[#07080f]',
    footerTagline:  'text-xs leading-relaxed text-gray-500 font-medium',
    footerColHead:  'text-white text-xs font-semibold uppercase tracking-wider mb-4',
    footerColLink:  'text-xs text-gray-600 hover:text-gray-300 transition-colors',
    footerCopyBd:   'border-white/5',
    footerCopyText: 'text-xs text-gray-700',
    footerCopyLink: 'text-xs text-gray-700 hover:text-gray-400 transition-colors',
    footerBorder:   'border-t border-white/5 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-600',
    footerLink:     'hover:text-slate-300',
    stepIcon:       'bg-gradient-to-br from-violet-500 to-indigo-600',
    stepTitle:      'font-bold text-white mb-1',
    stepBody:       'text-slate-400 text-sm leading-relaxed',
    bullet:         'bg-gradient-to-r from-violet-500 to-indigo-500',
    featTitle:      'font-semibold text-white',
    featDesc:       'text-slate-400',
    featBorder:     'border-b border-white/10 last:border-0',
    pricingHL:      'border-violet-400/50 shadow-xl shadow-violet-900/30 bg-slate-900/80',
    pricingNorm:    'border-white/10 bg-slate-900/40',
    pricingName:    'text-sm font-semibold text-slate-400 mb-1',
    pricingPrice:   'text-3xl font-bold text-white mb-1',
    pricingDesc:    'text-sm text-slate-400 mb-5',
    pricingFeat:    'text-sm text-slate-300 flex gap-2',
    pricingCheck:   'text-violet-400',
    pricingCtaHL:   'block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25',
    pricingCtaNorm: 'block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors bg-white/10 text-slate-200 hover:bg-white/15',
    contactCard:    'p-5 rounded-2xl',
    contactLabel:   'text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1',
    contactLink:    'text-sm font-medium text-violet-400 hover:underline',
    authCard:       'bg-slate-900/50 border border-white/10',
    authInput:      'bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10',
    authBtn:        'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/20',
    authBackLink:   'text-slate-500 hover:text-slate-300',
    authHomeBtn:    'bg-slate-900/60 border border-white/10 text-slate-400 hover:text-white',
    authCopyright:  'text-slate-600',
    authIconBg:     'bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20',
    authLabelText:  'text-slate-400',
    authGlow1:      'bg-violet-600/10',
    authGlow2:      'bg-indigo-600/10',
  },
  homepage3: {
    page:           'bg-[#FAF7F0] text-slate-800',
    font:           "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif",
    navBg:          'sticky top-0 z-40 flex items-center justify-between px-8 py-4 bg-[#FAF7F0]/85 backdrop-blur-md border-b border-amber-200/30',
    logoText:       'font-extrabold text-slate-900 tracking-tight',
    navMidLink:     'text-xs font-bold tracking-wider uppercase text-slate-500 hover:text-amber-700 transition-colors',
    signInLink:     'text-sm text-slate-600 hover:text-slate-900 font-medium px-3 py-1.5',
    ctaBtn:         'text-sm bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold px-4 py-2 rounded-xl shadow-md',
    headerBg:       'bg-gradient-to-b from-amber-50/70 to-transparent border-b border-amber-100/60 px-8 py-16 text-center',
    backLink:       'inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium mb-6 hover:underline',
    h1:             'text-4xl font-bold text-slate-900 mb-3 tracking-tight',
    subtitle:       'text-slate-500 max-w-xl mx-auto text-base',
    contentBg:      'flex-1 px-8 py-12 max-w-3xl mx-auto w-full',
    prose:          'text-slate-600',
    h2:             'text-xl font-bold text-slate-900 mt-8',
    strong:         'text-slate-900',
    cardBg:         'bg-white border border-amber-100',
    accentLink:     'text-amber-700 hover:underline',
    footerWrap:     'border-t border-amber-200/20 text-slate-500 px-8 pt-14 pb-8 bg-white',
    footerTagline:  'text-xs leading-relaxed text-slate-400 font-medium',
    footerColHead:  'text-slate-900 text-xs font-semibold uppercase tracking-wider mb-4',
    footerColLink:  'text-xs text-slate-400 hover:text-slate-700 transition-colors',
    footerCopyBd:   'border-amber-200/20',
    footerCopyText: 'text-xs text-slate-400',
    footerCopyLink: 'text-xs text-slate-400 hover:text-slate-700 transition-colors',
    footerBorder:   'border-t border-amber-100 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-400',
    footerLink:     'hover:text-gray-600',
    stepIcon:       'bg-gradient-to-br from-amber-500 to-rose-500',
    stepTitle:      'font-bold text-slate-900 mb-1',
    stepBody:       'text-slate-500 text-sm leading-relaxed',
    bullet:         'bg-gradient-to-r from-amber-500 to-rose-500',
    featTitle:      'font-semibold text-slate-900',
    featDesc:       'text-slate-500',
    featBorder:     'border-b border-amber-100 last:border-0',
    pricingHL:      'border-amber-400 shadow-xl shadow-amber-100 bg-gradient-to-b from-amber-50 to-white',
    pricingNorm:    'border-amber-100 bg-white',
    pricingName:    'text-sm font-semibold text-slate-500 mb-1',
    pricingPrice:   'text-3xl font-bold text-slate-900 mb-1',
    pricingDesc:    'text-sm text-slate-500 mb-5',
    pricingFeat:    'text-sm text-slate-600 flex gap-2',
    pricingCheck:   'text-amber-600',
    pricingCtaHL:   'block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white hover:opacity-95 shadow-md shadow-amber-500/25',
    pricingCtaNorm: 'block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors bg-slate-100 text-slate-900 hover:bg-slate-200',
    contactCard:    'p-5 rounded-2xl',
    contactLabel:   'text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1',
    contactLink:    'text-sm font-medium text-amber-700 hover:underline',
    authCard:       'bg-white border border-amber-200/60',
    authInput:      'bg-white border border-amber-200/60 text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10',
    authBtn:        'bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 hover:opacity-95 text-white shadow-md',
    authBackLink:   'text-slate-500 hover:text-slate-800',
    authHomeBtn:    'bg-white border border-amber-200/40 text-slate-500 hover:text-slate-900',
    authCopyright:  'text-slate-400',
    authIconBg:     'bg-gradient-to-tr from-amber-600 to-rose-500 shadow-md',
    authLabelText:  'text-slate-700',
    authGlow1:      'bg-amber-400/10',
    authGlow2:      'bg-rose-400/10',
  },
}

export function usePublicTheme() {
  const { activeHomepage } = useAppStore()
  return THEMES[activeHomepage] ?? THEMES.homepage1
}

// ── Layout wrapper ────────────────────────────────────────────────────────────

interface StaticPageProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function StaticPage({ title, subtitle, children }: StaticPageProps) {
  const theme = usePublicTheme()

  return (
    <div className={`min-h-screen flex flex-col ${theme.page}`} style={{ fontFamily: theme.font }}>

        {/* Nav */}
        <nav className={theme.navBg}>
          <Link to="/" className="flex items-center gap-2.5">
            <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className={theme.logoText}>SUPPORT247.chat</span>
          </Link>
          <div className="hidden md:flex items-center gap-7">
            <Link to="/"            className={theme.navMidLink}>Home</Link>
            <Link to="/how-it-works" className={theme.navMidLink}>How it works</Link>
            <Link to="/features"     className={theme.navMidLink}>Features</Link>
            <Link to="/pricing"      className={theme.navMidLink}>Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/app/login" className={theme.signInLink}>Sign in</Link>
            <Link to="/app/login?tab=register" className={theme.ctaBtn}>Sign up free</Link>
          </div>
        </nav>

        {/* Header */}
        <div className={theme.headerBg}>
          <Link to="/" className={theme.backLink}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to home
          </Link>
          <h1 className={theme.h1}>{title}</h1>
          {subtitle && <p className={theme.subtitle}>{subtitle}</p>}
        </div>

        {/* Content */}
        <main className={theme.contentBg}>
          <div className={`prose max-w-none text-sm leading-relaxed space-y-6 ${theme.prose}`}>
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className={theme.footerWrap}>
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-3">
                  <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-7 h-7 rounded-md object-cover" />
                  <span className={`text-sm font-semibold ${theme.logoText}`}>SUPPORT247.chat</span>
                </div>
                <p className={theme.footerTagline}>AI-powered multi-agent support for modern businesses.</p>
              </div>
              {Object.entries(FOOTER_LINKS).map(([group, links]) => (
                <div key={group}>
                  <p className={theme.footerColHead}>{group}</p>
                  <ul className="space-y-2.5">
                    {links.map(({ label, to }) => (
                      <li key={label}>
                        <Link to={to} className={theme.footerColLink}>{label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className={`border-t ${theme.footerCopyBd} pt-6 flex flex-col md:flex-row items-center justify-between gap-3`}>
              <p className={theme.footerCopyText}>© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
              <div className="flex items-center gap-5">
                <Link to="/privacy" className={theme.footerCopyLink}>Privacy</Link>
                <Link to="/terms"   className={theme.footerCopyLink}>Terms</Link>
                <Link to="/cookies" className={theme.footerCopyLink}>Cookies</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
  )
}


// ── Individual page content components ────────────────────────────────────────

export function AboutPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="About Us" subtitle="The story behind SUPPORT247.chat">
      <h2 className={t.h2}>Our mission</h2>
      <p>SUPPORT247.chat was built to solve a problem every growing business faces: as customer questions multiply, support quality degrades. We believed AI could change that — not by replacing human teams, but by making every agent smarter and every response faster.</p>
      <p>Our platform lets any business deploy a fleet of specialized AI agents, each trained on their own documentation and fine-tuned for their domain, orchestrated by a routing layer that puts the right answer in front of the right customer every time.</p>

      <h2 className={t.h2}>Why we built this</h2>
      <p>We watched support teams burn out answering the same questions while customers waited hours for responses. We knew that RAG-powered AI, combined with smart routing, could give customers instant answers from authoritative sources — and give support teams back their time to focus on complex issues that genuinely need a human.</p>

      <h2 className={t.h2}>Our values</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li><strong className={t.strong}>Accuracy first:</strong> We cite every answer with its source so customers can trust what they read.</li>
        <li><strong className={t.strong}>Transparent AI:</strong> We tell customers when they're talking to an AI — no deception.</li>
        <li><strong className={t.strong}>Built for scale:</strong> From a 5-person startup to an enterprise with millions of tickets, the platform grows with you.</li>
      </ul>
    </StaticPage>
  )
}

export function WhatWeDoPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="What We Do" subtitle="A complete AI support platform, from first message to resolution">
      <h2 className={t.h2}>Multi-agent orchestration</h2>
      <p>We orchestrate multiple specialized AI agents under one roof. A triage agent reads every incoming message and routes it to the most qualified specialist — finance, logistics, technical support, or any custom agent you configure. Routing decisions happen in under a second.</p>

      <h2 className={t.h2}>RAG-powered knowledge base</h2>
      <p>Agents don't guess — they read. Upload your manuals, policies, FAQs, and product documentation. Our retrieval-augmented generation (RAG) pipeline embeds and indexes every document, so agents retrieve exact excerpts and cite their sources in every response.</p>

      <h2 className={t.h2}>Branded customer experience</h2>
      <p>Every organization gets a white-labeled chat page at their own slug. Customers can find any organization through our global search — or be linked directly from your website, email signature, or QR code.</p>

      <h2 className={t.h2}>Analytics & insights</h2>
      <p>A real-time dashboard shows message volume, RAG hit rates, agent utilization, resolution trends, and sentiment — giving support managers the data they need to improve.</p>
    </StaticPage>
  )
}

export function HowItWorksPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="How It Works" subtitle="From sign-up to live in three steps">
      {[
        {
          step: '01', title: 'Create your organization',
          body: 'Register with your email, choose a slug (e.g. acme-corp), and your branded chat page is live immediately at /acme-corp. No setup fee, no credit card required.',
        },
        {
          step: '02', title: 'Configure your agents',
          body: 'Enable any of the five built-in agents (triage, finance, logistics, tech support, order management) or create custom agents with your own system prompts. Upload your knowledge base documents — PDFs, Word docs, plain text — and the RAG pipeline handles indexing automatically.',
        },
        {
          step: '03', title: 'Go live',
          body: "Share your chat URL, embed a chat widget on your website, or let customers find you through SUPPORT247.chat's global search. Every message is routed, answered, logged, and analyzed in real time.",
        },
      ].map(({ step, title, body }) => (
        <div key={step} className={`flex gap-6 p-6 rounded-2xl ${t.cardBg}`}>
          <div className={`w-12 h-12 flex-shrink-0 rounded-xl ${t.stepIcon} flex items-center justify-center text-white font-bold text-sm`}>{step}</div>
          <div>
            <h3 className={t.stepTitle}>{title}</h3>
            <p className={t.stepBody}>{body}</p>
          </div>
        </div>
      ))}
    </StaticPage>
  )
}

export function FeaturesPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Features" subtitle="Everything you need to build a world-class AI support operation">
      {[
        ['Multi-agent routing', 'Triage agent reads intent and hands off to the right specialist automatically.'],
        ['RAG knowledge base', 'Upload docs, index automatically, get cited answers from real sources.'],
        ['Custom agents', 'Build agents from scratch with custom system prompts and document sets.'],
        ['Branded chat page', 'Your logo, your colors, your slug — fully white-labeled.'],
        ['Session history', 'Customers can restore previous conversations. Full session persistence.'],
        ['Chat suggestions', 'AI-generated question chips based on your active agents and knowledge base.'],
        ['Real-time analytics', 'Message volume, RAG hit rate, agent performance, and more.'],
        ['Redis caching', 'Sub-millisecond response for cached sessions and suggestions.'],
        ['Multi-theme chat UI', 'Dark, blue, and light themes — customers choose what looks best.'],
        ['Markdown responses', 'AI responses render bold, italic, and numbered lists beautifully.'],
      ].map(([title, desc]) => (
        <div key={title} className={`flex gap-4 items-start py-4 ${t.featBorder}`}>
          <div className={`w-2 h-2 rounded-full ${t.bullet} mt-2 flex-shrink-0`} />
          <div><span className={t.featTitle}>{title} — </span><span className={t.featDesc}>{desc}</span></div>
        </div>
      ))}
    </StaticPage>
  )
}

export function PricingPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Pricing" subtitle="Simple, transparent pricing that scales with you">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 not-prose">
        {[
          { name: 'Free', price: '$0', desc: 'Perfect for small teams getting started.', features: ['Up to 500 messages/mo', '3 active agents', '1 GB knowledge base', 'Community support'], cta: 'Get started', highlight: false },
          { name: 'Pro', price: '$49', desc: 'For growing businesses with real volume.', features: ['Up to 20,000 messages/mo', 'Unlimited agents', '10 GB knowledge base', 'Analytics dashboard', 'Priority support'], cta: 'Start free trial', highlight: true },
          { name: 'Enterprise', price: 'Custom', desc: 'For large-scale deployments.', features: ['Unlimited messages', 'Unlimited agents', 'Unlimited storage', 'SLA guarantee', 'Dedicated support', 'Custom integrations'], cta: 'Contact us', highlight: false },
        ].map(({ name, price, desc, features, cta, highlight }) => (
          <div key={name} className={`rounded-2xl border p-6 flex flex-col ${highlight ? t.pricingHL : t.pricingNorm}`}>
            <p className={t.pricingName}>{name}</p>
            <p className={t.pricingPrice}>{price}<span className="text-sm font-normal opacity-50">{price !== 'Custom' ? '/mo' : ''}</span></p>
            <p className={t.pricingDesc}>{desc}</p>
            <ul className="space-y-2 flex-1 mb-6">
              {features.map(f => <li key={f} className={t.pricingFeat}><span className={t.pricingCheck}>✓</span>{f}</li>)}
            </ul>
            <Link to="/app/login" className={highlight ? t.pricingCtaHL : t.pricingCtaNorm}>{cta}</Link>
          </div>
        ))}
      </div>
    </StaticPage>
  )
}

export function PrivacyPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Privacy Policy" subtitle="Last updated January 2025">
      <p>Your privacy matters to us. This policy explains what data SUPPORT247.chat collects, how we use it, and the choices you have.</p>
      <h2 className={t.h2}>Data we collect</h2>
      <p>We collect your email address and organization name at registration. We log chat messages to provide analytics to organization administrators. We do not sell your data to third parties.</p>
      <h2 className={t.h2}>How we use your data</h2>
      <p>Chat logs are used to generate analytics and improve agent performance for the organization you interacted with. We use aggregate, anonymized data to improve our platform.</p>
      <h2 className={t.h2}>Data retention</h2>
      <p>Organization data is retained for the lifetime of the account plus 30 days after deletion. You may request deletion at any time by contacting support.</p>
      <h2 className={t.h2}>Contact</h2>
      <p>For privacy-related questions, email <a href="mailto:help@support247.chat" className={t.accentLink}>help@support247.chat</a>.</p>
    </StaticPage>
  )
}

export function TermsPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Terms & Conditions" subtitle="Last updated January 2025">
      <p>By using SUPPORT247.chat you agree to these terms. Please read them carefully.</p>
      <h2 className={t.h2}>Use of service</h2>
      <p>You may use SUPPORT247.chat for lawful purposes only. You are responsible for content uploaded to the knowledge base and for the behavior of AI agents configured under your organization.</p>
      <h2 className={t.h2}>Account responsibility</h2>
      <p>You are responsible for maintaining the security of your account credentials. SUPPORT247.chat is not liable for losses resulting from unauthorized account access.</p>
      <h2 className={t.h2}>AI-generated content</h2>
      <p>AI responses are generated automatically and may not always be accurate. SUPPORT247.chat does not warrant the accuracy of AI responses. Organizations are responsible for reviewing agent outputs.</p>
      <h2 className={t.h2}>Limitation of liability</h2>
      <p>SUPPORT247.chat's liability is limited to the amount paid in the 12 months preceding the claim.</p>
    </StaticPage>
  )
}

export function CookiesPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Cookie Policy" subtitle="How and why we use cookies">
      <p>SUPPORT247.chat uses a minimal set of cookies to keep the platform functional and improve your experience.</p>
      <h2 className={t.h2}>Essential cookies</h2>
      <p>Authentication tokens are stored in browser localStorage to keep you signed in. These are strictly necessary and cannot be disabled.</p>
      <h2 className={t.h2}>Preference cookies</h2>
      <p>We store your theme preference (dark/light) and sidebar state locally on your device. These do not leave your browser.</p>
      <h2 className={t.h2}>Analytics cookies</h2>
      <p>We do not currently use third-party analytics cookies. Internal analytics are derived from server-side logs only.</p>
    </StaticPage>
  )
}

export function ContactPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Contact Us" subtitle="We'd love to hear from you">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 not-prose">
        {[
          { label: 'General enquiries', email: 'hello@support247.chat' },
          { label: 'Support',           email: 'help@support247.chat'  },
        ].map(({ label, email }) => (
          <div key={label} className={`${t.contactCard} ${t.cardBg}`}>
            <p className={t.contactLabel}>{label}</p>
            <a href={`mailto:${email}`} className={t.contactLink}>{email}</a>
          </div>
        ))}
      </div>
      <p className={`mt-8 text-sm ${t.prose}`}>We aim to respond to all enquiries within one business day.</p>
    </StaticPage>
  )
}

export function SecurityPage() {
  const t = usePublicTheme()
  return (
    <StaticPage title="Security" subtitle="How we protect your data">
      <p>Security is a core part of how SUPPORT247.chat is built, not an afterthought.</p>
      <h2 className={t.h2}>Authentication</h2>
      <p>All passwords are hashed using bcrypt. Authentication tokens are short-lived JWTs signed with RS256.</p>
      <h2 className={t.h2}>Data in transit</h2>
      <p>All communication between clients and our servers is encrypted via TLS 1.3.</p>
      <h2 className={t.h2}>Data at rest</h2>
      <p>Databases are encrypted at rest. Vector embeddings are stored in an isolated ChromaDB instance per deployment.</p>
      <h2 className={t.h2}>Responsible disclosure</h2>
      <p>Found a vulnerability? Please report it to <a href="mailto:security@support247.chat" className={t.accentLink}>security@support247.chat</a>. We respond within 48 hours.</p>
    </StaticPage>
  )
}
