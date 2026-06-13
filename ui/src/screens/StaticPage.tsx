/**
 * Shared layout for all static marketing / legal pages.
 * Includes a sticky nav and footer matching Home.tsx.
 */
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { IMAGES } from '../config/images.config'

interface StaticPageProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function StaticPage({ title, subtitle, children }: StaticPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}>

      {/* Nav */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-8 py-4 bg-white/90 backdrop-blur border-b border-gray-100">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
          <span className="font-bold text-gray-900 tracking-tight">SUPPORT247.chat</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/app/login" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-1.5">Sign in</Link>
          <Link to="/app/login?tab=register" className="text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold px-4 py-2 rounded-xl shadow-md shadow-indigo-500/25">Sign up free</Link>
        </div>
      </nav>

      {/* Header */}
      <div className="bg-gradient-to-b from-indigo-50/60 to-white px-8 py-16 text-center">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-medium mb-6 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </Link>
        <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">{title}</h1>
        {subtitle && <p className="text-gray-500 max-w-xl mx-auto text-base">{subtitle}</p>}
      </div>

      {/* Content */}
      <main className="flex-1 px-8 py-12 max-w-3xl mx-auto w-full">
        <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-600 space-y-6">
          {children}
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-gray-100 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-400">
        <p>© {new Date().getFullYear()} SUPPORT247.chat</p>
        <div className="flex items-center gap-5">
          <Link to="/privacy" className="hover:text-gray-600">Privacy</Link>
          <Link to="/terms"   className="hover:text-gray-600">Terms</Link>
          <Link to="/contact" className="hover:text-gray-600">Contact</Link>
        </div>
      </footer>
    </div>
  )
}


// ── Individual page content components ────────────────────────────────────────

export function AboutPage() {
  return (
    <StaticPage title="About Us" subtitle="The story behind SUPPORT247.chat">
      <h2 className="text-xl font-bold text-gray-900">Our mission</h2>
      <p>SUPPORT247.chat was built to solve a problem every growing business faces: as customer questions multiply, support quality degrades. We believed AI could change that — not by replacing human teams, but by making every agent smarter and every response faster.</p>
      <p>Our platform lets any business deploy a fleet of specialized AI agents, each trained on their own documentation and fine-tuned for their domain, orchestrated by a routing layer that puts the right answer in front of the right customer every time.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8">Why we built this</h2>
      <p>We watched support teams burn out answering the same questions while customers waited hours for responses. We knew that RAG-powered AI, combined with smart routing, could give customers instant answers from authoritative sources — and give support teams back their time to focus on complex issues that genuinely need a human.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8">Our values</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Accuracy first:</strong> We cite every answer with its source so customers can trust what they read.</li>
        <li><strong>Transparent AI:</strong> We tell customers when they're talking to an AI — no deception.</li>
        <li><strong>Built for scale:</strong> From a 5-person startup to an enterprise with millions of tickets, the platform grows with you.</li>
      </ul>
    </StaticPage>
  )
}

export function WhatWeDoPage() {
  return (
    <StaticPage title="What We Do" subtitle="A complete AI support platform, from first message to resolution">
      <h2 className="text-xl font-bold text-gray-900">Multi-agent orchestration</h2>
      <p>We orchestrate multiple specialized AI agents under one roof. A triage agent reads every incoming message and routes it to the most qualified specialist — finance, logistics, technical support, or any custom agent you configure. Routing decisions happen in under a second.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8">RAG-powered knowledge base</h2>
      <p>Agents don't guess — they read. Upload your manuals, policies, FAQs, and product documentation. Our retrieval-augmented generation (RAG) pipeline embeds and indexes every document, so agents retrieve exact excerpts and cite their sources in every response.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8">Branded customer experience</h2>
      <p>Every organization gets a white-labeled chat page at their own slug. Customers can find any organization through our global search — or be linked directly from your website, email signature, or QR code.</p>

      <h2 className="text-xl font-bold text-gray-900 mt-8">Analytics & insights</h2>
      <p>A real-time dashboard shows message volume, RAG hit rates, agent utilization, resolution trends, and sentiment — giving support managers the data they need to improve.</p>
    </StaticPage>
  )
}

export function HowItWorksPage() {
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
          body: 'Share your chat URL, embed a chat widget on your website, or let customers find you through SUPPORT247.chat\'s global search. Every message is routed, answered, logged, and analyzed in real time.',
        },
      ].map(({ step, title, body }) => (
        <div key={step} className="flex gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-100">
          <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">{step}</div>
          <div>
            <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
          </div>
        </div>
      ))}
    </StaticPage>
  )
}

export function FeaturesPage() {
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
        <div key={title} className="flex gap-4 items-start py-4 border-b border-gray-100 last:border-0">
          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 mt-2 flex-shrink-0" />
          <div><span className="font-semibold text-gray-900">{title} — </span><span className="text-gray-500">{desc}</span></div>
        </div>
      ))}
    </StaticPage>
  )
}

export function PricingPage() {
  return (
    <StaticPage title="Pricing" subtitle="Simple, transparent pricing that scales with you">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 not-prose">
        {[
          { name: 'Free', price: '$0', desc: 'Perfect for small teams getting started.', features: ['Up to 500 messages/mo', '3 active agents', '1 GB knowledge base', 'Community support'], cta: 'Get started', highlight: false },
          { name: 'Pro', price: '$49', desc: 'For growing businesses with real volume.', features: ['Up to 20,000 messages/mo', 'Unlimited agents', '10 GB knowledge base', 'Analytics dashboard', 'Priority support'], cta: 'Start free trial', highlight: true },
          { name: 'Enterprise', price: 'Custom', desc: 'For large-scale deployments.', features: ['Unlimited messages', 'Unlimited agents', 'Unlimited storage', 'SLA guarantee', 'Dedicated support', 'Custom integrations'], cta: 'Contact us', highlight: false },
        ].map(({ name, price, desc, features, cta, highlight }) => (
          <div key={name} className={`rounded-2xl border p-6 flex flex-col ${highlight ? 'border-indigo-400 shadow-xl shadow-indigo-100 bg-gradient-to-b from-indigo-50 to-white' : 'border-gray-200 bg-white'}`}>
            <p className="text-sm font-semibold text-gray-500 mb-1">{name}</p>
            <p className="text-3xl font-bold text-gray-900 mb-1">{price}<span className="text-sm font-normal text-gray-400">{price !== 'Custom' ? '/mo' : ''}</span></p>
            <p className="text-sm text-gray-500 mb-5">{desc}</p>
            <ul className="space-y-2 flex-1 mb-6">
              {features.map(f => <li key={f} className="text-sm text-gray-600 flex gap-2"><span className="text-indigo-500">✓</span>{f}</li>)}
            </ul>
            <Link to="/app/login" className={`block text-center text-sm font-semibold py-2.5 rounded-xl transition-colors ${highlight ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-500/25' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>{cta}</Link>
          </div>
        ))}
      </div>
    </StaticPage>
  )
}

export function PrivacyPage() {
  return (
    <StaticPage title="Privacy Policy" subtitle="Last updated January 2025">
      <p>Your privacy matters to us. This policy explains what data SUPPORT247.chat collects, how we use it, and the choices you have.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Data we collect</h2>
      <p>We collect your email address and organization name at registration. We log chat messages to provide analytics to organization administrators. We do not sell your data to third parties.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">How we use your data</h2>
      <p>Chat logs are used to generate analytics and improve agent performance for the organization you interacted with. We use aggregate, anonymized data to improve our platform.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Data retention</h2>
      <p>Organization data is retained for the lifetime of the account plus 30 days after deletion. You may request deletion at any time by contacting support.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Contact</h2>
      <p>For privacy-related questions, email <a href="mailto:privacy@SUPPORT247.chat" className="text-indigo-600 hover:underline">privacy@SUPPORT247.chat</a>.</p>
    </StaticPage>
  )
}

export function TermsPage() {
  return (
    <StaticPage title="Terms & Conditions" subtitle="Last updated January 2025">
      <p>By using SUPPORT247.chat you agree to these terms. Please read them carefully.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Use of service</h2>
      <p>You may use SUPPORT247.chat for lawful purposes only. You are responsible for content uploaded to the knowledge base and for the behavior of AI agents configured under your organization.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Account responsibility</h2>
      <p>You are responsible for maintaining the security of your account credentials. SUPPORT247.chat is not liable for losses resulting from unauthorized account access.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">AI-generated content</h2>
      <p>AI responses are generated automatically and may not always be accurate. SUPPORT247.chat does not warrant the accuracy of AI responses. Organizations are responsible for reviewing agent outputs.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Limitation of liability</h2>
      <p>SUPPORT247.chat's liability is limited to the amount paid in the 12 months preceding the claim.</p>
    </StaticPage>
  )
}

export function CookiesPage() {
  return (
    <StaticPage title="Cookie Policy" subtitle="How and why we use cookies">
      <p>SUPPORT247.chat uses a minimal set of cookies to keep the platform functional and improve your experience.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Essential cookies</h2>
      <p>Authentication tokens are stored in browser localStorage to keep you signed in. These are strictly necessary and cannot be disabled.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Preference cookies</h2>
      <p>We store your theme preference (dark/light) and sidebar state locally on your device. These do not leave your browser.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Analytics cookies</h2>
      <p>We do not currently use third-party analytics cookies. Internal analytics are derived from server-side logs only.</p>
    </StaticPage>
  )
}

export function ContactPage() {
  return (
    <StaticPage title="Contact Us" subtitle="We'd love to hear from you">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 not-prose">
        {[
          { label: 'General enquiries', email: 'hello@SUPPORT247.chat' },
          { label: 'Support',           email: 'support@SUPPORT247.chat' },
          { label: 'Privacy',           email: 'privacy@SUPPORT247.chat' },
          { label: 'Partnerships',      email: 'partners@SUPPORT247.chat' },
        ].map(({ label, email }) => (
          <div key={label} className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <a href={`mailto:${email}`} className="text-sm font-medium text-indigo-600 hover:underline">{email}</a>
          </div>
        ))}
      </div>
      <p className="mt-8 text-gray-500 text-sm">We aim to respond to all enquiries within one business day.</p>
    </StaticPage>
  )
}

export function SecurityPage() {
  return (
    <StaticPage title="Security" subtitle="How we protect your data">
      <p>Security is a core part of how SUPPORT247.chat is built, not an afterthought.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Authentication</h2>
      <p>All passwords are hashed using bcrypt. Authentication tokens are short-lived JWTs signed with RS256.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Data in transit</h2>
      <p>All communication between clients and our servers is encrypted via TLS 1.3.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Data at rest</h2>
      <p>Databases are encrypted at rest. Vector embeddings are stored in an isolated ChromaDB instance per deployment.</p>
      <h2 className="text-xl font-bold text-gray-900 mt-8">Responsible disclosure</h2>
      <p>Found a vulnerability? Please report it to <a href="mailto:security@SUPPORT247.chat" className="text-indigo-600 hover:underline">security@SUPPORT247.chat</a>. We respond within 48 hours.</p>
    </StaticPage>
  )
}
