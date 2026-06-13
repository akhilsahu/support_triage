import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Globe, MessageSquare, ShoppingBag, Layers, ShieldCheck, Home, FileText, Bot, Share2, Shield } from 'lucide-react'
import { IMAGES } from '../../../config/images.config'

const FOOTER_LINKS = {
  Product: [
    { label: 'How it works',       to: '/how-it-works' },
    { label: 'What we do',         to: '/what-we-do'   },
    { label: 'Features',           to: '/features'     },
    { label: 'Pricing',            to: '/pricing'      },
  ],
  Company: [
    { label: 'About us',           to: '/about'        },
    { label: 'Blog',               to: '/about'         },
    { label: 'Careers',            to: '/about'      },
    { label: 'Contact',            to: '/about'      },
  ],
  Legal: [
    { label: 'Privacy Policy',     to: '/privacy'      },
    { label: 'Terms & Conditions', to: '/terms'        },
    { label: 'Cookie Policy',      to: '/cookies'      },
    { label: 'Security',           to: '/security'     },
  ],
  Support: [
    { label: 'Documentation',      to: '/docs'         },
    { label: 'Help Center',        to: '/help'         },
    { label: 'API Reference',      to: '/api-reference'},
    { label: 'Status',             to: '/status'       },
  ],
}

export function HowItWorks2() {
  return (
    <div className="min-h-screen flex flex-col bg-[#090a15] text-slate-300" style={{
      fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif",
    }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5 backdrop-blur-md bg-[#090a15]/75">
        <Link to="/" className="flex items-center gap-3">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-md shadow-violet-500/20" />
          <span className="font-bold text-white tracking-tight text-sm md:text-base">SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wider uppercase text-slate-400">
          <Link to="/"            className="hover:text-white transition-colors">Home</Link>
          <Link to="/how-it-works" className="text-white transition-colors">How it works</Link>
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

      {/* Header */}
      <div className="relative overflow-hidden px-6 md:px-12 pt-12 pb-10 text-center border-b border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] right-[-5%] w-[600px] h-[300px] rounded-full bg-violet-600/5 blur-[100px]" />
        </div>
        
        <h1 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight leading-none">
          How SUPPORT247.chat Works
        </h1>
        <p className="text-slate-450 max-w-xl mx-auto text-xs md:text-sm font-semibold leading-relaxed">
          Learn how our dynamic vector engine processes PDF documentation and routes live, cited AI support conversations.
        </p>
      </div>



      {/* Content */}
      <main className="flex-1 px-6 md:px-12 py-16 max-w-5xl mx-auto w-full space-y-24">
        
        {/* Step 1 */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-8 space-y-6">
            <span className="text-xs uppercase font-bold text-violet-400 tracking-wider">Step 01 / Knowledge Base Ingestion</span>
            <h2 className="text-3xl font-black text-white tracking-tight">Upload PDF support guidelines</h2>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              Feed your virtual assistants directly from catalog sheets, instruction booklets, operations manuals, or FAQ lists. Drop standard PDF files inside the knowledge base console. Our system extracts text layers, splits them into semantic paragraphs without breaking guidelines, and calculates 384-dimensional dense vectors. Indexed using PostgreSQL with pgvector, the agent accesses context instantly to formulate cited customer replies.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { title: 'Automatic Chunking', desc: 'Slices documents semantic-by-semantic to keep instructions intact.' },
                { title: 'pgvector Dense Search', desc: 'Safeguards vector files inside PostgreSQL to fetch context in milliseconds.' },
                { title: 'Hot Reloading Sync', desc: 'Syncing refreshed catalog files live updates the agent knowledge base instantly.' }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-extrabold text-white uppercase flex items-center gap-1.5 tracking-wider">
                    <FileText className="w-3.5 h-3.5 text-violet-400" /> {item.title}
                  </h4>
                  <p className="text-slate-500 text-[11px] leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="w-full max-w-[280px] p-6 rounded-3xl bg-slate-900/40 border border-white/5 flex flex-col items-center text-center shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 mb-4">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-wider">Knowledge Base Ingestion</span>
              <span className="text-[10px] text-slate-500 mt-1">Accepts standard PDF formats</span>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-6">
                <div className="w-[85%] h-full bg-gradient-to-r from-violet-650 to-indigo-650 rounded-full" />
              </div>
              <span className="text-[9px] text-violet-400 font-semibold mt-2 uppercase tracking-wider">85% Processed</span>
            </div>
          </div>
        </section>

        {/* Step 2 */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-4 flex justify-center lg:justify-start order-2 lg:order-1">
            <div className="w-full max-w-[280px] p-6 rounded-3xl bg-slate-900/40 border border-white/5 flex flex-col shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Agent Fleet</h4>
                  <p className="text-[10px] text-slate-500">Active Rules</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Tone Preference</span>
                  <span className="text-xs text-slate-300 font-medium">Concise, strict RAG matching.</span>
                </div>
                <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Source Compliance</span>
                  <span className="text-xs text-slate-300 font-medium">Locked strictly to PDF context.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6 order-1 lg:order-2">
            <span className="text-xs uppercase font-bold text-violet-400 tracking-wider">Step 02 / Agent Orchestration</span>
            <h2 className="text-3xl font-black text-white tracking-tight">Deploy specialized customer support agents</h2>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              Create and detail your autonomous agents inside the workspace. Write exact guidelines to shape agent styles and tone of voice (e.g. professional and brief support responses). Crucially, agents operate under strict RAG instructions. If a customer inquires about catalog listings not detailed inside your uploaded PDF folders, the system forces the agent to state 'Information not found' instead of hallucinating answers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { title: 'Strict RAG matching', desc: 'Restricts replies to manual files, blocking false or off-topic responses.' },
                { title: 'Custom Instructions', desc: 'Configure guidelines, greetings, tone, and brand constraints.' },
                { title: 'Human Escalation', desc: 'Automatically flags complex threads and hands conversation context to support inbox.' }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-extrabold text-white uppercase flex items-center gap-1.5 tracking-wider">
                    <Shield className="w-3.5 h-3.5 text-violet-400" /> {item.title}
                  </h4>
                  <p className="text-slate-550 text-[11px] leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-8 space-y-6">
            <span className="text-xs uppercase font-bold text-violet-400 tracking-wider">Step 03 / Live Channel Deployment</span>
            <h2 className="text-3xl font-black text-white tracking-tight">Share your public link or embed script snippet</h2>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              Launch your virtual workspace instantly. Upon setup, secure a customized company subdomain link (e.g., support247.chat/acme) that visitors can access directly from any mobile or desktop browser. In addition, copy-pasteable script widget tags let you render a modern chat bubble inside any landing page or Shopify storefront. All chats run over low-latency WebSockets to stream answers in real time.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { title: 'Subdomain Link', desc: 'Clean, dedicated branded URL ready for customer access and sharing.' },
                { title: 'JS Widget Embed', desc: 'Copy-pasteable widget snippet that embeds a chat bubble without slowing your site.' },
                { title: 'WebSocket Stream', desc: 'Low-latency connections that stream responses line-by-line instantly.' }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-extrabold text-white uppercase flex items-center gap-1.5 tracking-wider">
                    <Share2 className="w-3.5 h-3.5 text-violet-400" /> {item.title}
                  </h4>
                  <p className="text-slate-500 text-[11px] leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="w-full max-w-[280px] p-6 rounded-3xl bg-slate-900/40 border border-white/5 flex flex-col shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Live & Active</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center mt-2">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Subdomain URL</span>
                <span className="text-xs text-violet-400 font-bold truncate block">support247.chat/acme</span>
              </div>
              <button className="w-full bg-gradient-to-r from-violet-650 to-indigo-650 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95 mt-6">
                Copy Embed Script
              </button>
            </div>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="mt-24 pt-16 border-t border-white/5">
          <div className="text-center mb-16">
            <h3 className="text-2xl font-bold text-white mb-3 uppercase tracking-wider">Integrations</h3>
            <p className="text-slate-400 text-sm max-w-md mx-auto">Connect your support chatbot seamlessly to your entire product suite.</p>
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
              <div key={idx} className="relative p-6 rounded-3xl bg-slate-900/40 border border-white/5 flex flex-col items-start text-left hover:border-violet-500/35 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 mb-4 flex-shrink-0">
                  <item.icon className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-white mb-2">{item.title}</h4>
                <p className="text-slate-400 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Highlights */}
        <div className="mt-24 pt-16 border-t border-white/5">
          <h3 className="text-2xl font-bold text-white text-center mb-10 uppercase tracking-wide">Advanced Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              ['Dynamic Classification', 'Questions are instantly parsed by a triage agent and delegated in under a second.'],
              ['Cited Document Search', 'RAG search queries point directly to the loaded files for absolute verification.'],
              ['Live Control Dashboard', 'Track latency, search hits, and conversation analytics charts.'],
              ['Adaptive Styling', 'Visual presentation automatically aligns with your active space theme choice.'],
            ].map(([title, desc]) => (
              <div key={title} className="p-6 rounded-2xl bg-slate-900/20 border border-white/5 flex gap-4">
                <CheckCircle2 className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-white text-sm mb-1">{title}</h4>
                  <p className="text-slate-450 text-xs leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* CTA */}
      <section className="px-6 md:px-12 py-20 bg-[#090a15] relative overflow-hidden flex flex-col items-center border-t border-white/5">
        <div className="max-w-4xl mx-auto w-full p-12 rounded-3xl bg-gradient-to-r from-violet-950/20 to-indigo-950/20 border border-white/10 flex flex-col items-center justify-center text-center relative z-10 backdrop-blur-xl">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Deploy your customer support agents today</h2>
          <p className="text-slate-450 text-xs md:text-sm mb-8 max-w-sm">No credit card required. Free tier includes full multi-agent support setup.</p>
          <Link to="/app/login?tab=register"
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-600/30 active:scale-95">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 text-slate-500 px-6 md:px-12 py-12 bg-slate-950/60 text-xs">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-7 h-7 rounded-md object-cover" />
                <span className="text-white font-semibold text-xs tracking-wider">SUPPORT247.chat</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-550">Autonomous multi-agent customer chat platform.</p>
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
            <p className="text-slate-650 font-semibold">© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
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
