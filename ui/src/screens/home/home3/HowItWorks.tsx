import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Globe, MessageSquare, ShoppingBag, Layers, ShieldCheck, Home, Bot, FileText, Share2, Shield, Settings, Zap } from 'lucide-react'
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
    { label: 'Contact',            to: '/contact'      },
  ],
  Legal: [
    { label: 'Privacy Policy',     to: '/privacy'      },
    { label: 'Terms & Conditions', to: '/terms'        },
    { label: 'Cookie Policy',      to: '/cookies'      },
    { label: 'Security',           to: '/security'     },
  ],
}

export function HowItWorks3() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] text-slate-800" style={{
      fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif",
    }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-5 border-b border-amber-200/30 bg-[#FAF7F0]/85 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-sm shadow-amber-500/10" />
          <span className="font-extrabold text-slate-900 tracking-tight text-sm md:text-base">SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-wider uppercase text-slate-500">
          <Link to="/"            className="hover:text-amber-700 transition-colors">Home</Link>
          <Link to="/how-it-works" className="text-amber-700 transition-colors">How it works</Link>
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

      {/* Header */}
      <div className="relative px-6 md:px-12 pt-12 pb-10 text-center border-b border-amber-200/20">
        
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-3 tracking-tight leading-none">
          How SUPPORT247.chat Works
        </h1>
        <p className="text-slate-550 max-w-xl mx-auto text-xs md:text-sm font-semibold leading-relaxed">
          Learn how our modern vector engine ingest documents, configures intelligent support agents, and streams low-latency customer chats.
        </p>
      </div>



      {/* ── Step 1: Upload Documents (Obsidian Dark Block) ──────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-[#12131a] text-white border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-8">
              <span className="text-xs uppercase font-extrabold text-amber-500 tracking-[0.25em] block mb-4">Step 01 / Knowledge Ingestion</span>
              <h2 className="text-3xl md:text-4xl font-black mb-6 tracking-tight text-white leading-tight">
                Upload your business manuals and PDF catalogs
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">
                Our platform learns directly from your loaded catalog files, operations manuals, or FAQ lists. Simply drag and drop your PDFs into the knowledge dashboard. Our backend immediately parses the files, segments the text into semantically logical chunks, and generates 384-dimensional dense vector embeddings. These are stored inside PostgreSQL with the pgvector extension. When a customer asks a question, we instantly query the database to retrieve only the relevant information matching their exact intent.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { title: 'Automatic Chunking', desc: 'Slices documents into cohesive paragraphs without cutting instructions in half.' },
                  { title: 'Dense Vector Embeddings', desc: 'Converts documents into numerical vectors to capture true semantic meaning.' },
                  { title: 'pgvector Search', desc: 'Performs low-latency database searches to retrieve matching context in milliseconds.' }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col">
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-rose-500" /> {item.title}
                    </h4>
                    <p className="text-slate-400 text-[11px] leading-relaxed font-semibold">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <div className="w-full max-w-[280px] p-6 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center text-center shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-200">Drag & Drop Documents</span>
                <span className="text-[10px] text-slate-500 mt-1">Accepts PDF format · Up to 50MB</span>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-6">
                  <div className="w-[85%] h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full" />
                </div>
                <span className="text-[9px] text-rose-400 font-extrabold mt-2 uppercase tracking-wider">85% Processed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Step 2: Create Agent (Beigish Light Block) ─────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-[#FAF7F0] text-slate-800 border-b border-amber-200/20">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-4 flex justify-center lg:justify-start order-2 lg:order-1">
              <div className="w-full max-w-[280px] p-6 rounded-2xl bg-white border border-amber-200/40 flex flex-col shadow-lg">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Custom Agent Pool</h4>
                    <p className="text-[10px] text-slate-500">Active Settings</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/20">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tone & Guidelines</span>
                    <span className="text-xs text-slate-700 font-semibold">Strict compliance, professional, no explanations of tech stack.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/20">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Retrieval Boundary</span>
                    <span className="text-xs text-slate-700 font-semibold">Locked to Knowledge base.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 order-1 lg:order-2">
              <span className="text-xs uppercase font-extrabold text-rose-500 tracking-[0.25em] block mb-4">Step 02 / AI Settings</span>
              <h2 className="text-3xl md:text-4xl font-black mb-6 tracking-tight text-slate-900 leading-tight">
                Configure agent rules and behavior boundaries
              </h2>
              <p className="text-slate-650 text-sm leading-relaxed mb-8 font-medium">
                Assemble and design your automated customer support agent in seconds. Write clear system instructions to dictate exactly how the agent behaves and speaks (e.g. professional and concise tone of voice). Importantly, all agents run under strict retrieval boundaries. If a client queries details not documented inside your uploaded PDF knowledge base, the assistant is constrained to state 'I do not have those details' rather than hallucinating fictitious answers.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { title: 'Strict RAG Boundaries', desc: 'Blocks generic off-topic chat; agent replies are locked strictly to your PDFs.' },
                  { title: 'Instruction Setting', desc: 'Custom rules to match your brand style, greetings, and active support guidelines.' },
                  { title: 'Human Escalation', desc: 'Integrated handoff flags queries and transfers conversation history directly to the inbox.' }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-600" /> {item.title}
                    </h4>
                    <p className="text-slate-550 text-[11px] leading-relaxed font-semibold">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Step 3: Share Link (Obsidian Dark Block) ────────────────────────── */}
      <section className="px-6 md:px-12 py-24 bg-[#12131a] text-white border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-8">
              <span className="text-xs uppercase font-extrabold text-amber-500 tracking-[0.25em] block mb-4">Step 03 / Channel Deployment</span>
              <h2 className="text-3xl md:text-4xl font-black mb-6 tracking-tight text-white leading-tight">
                Share your direct public link or embed scripts
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">
                Publish your custom workspace instantly. Upon registration, you secure a clean, tailored subdomain link (e.g., support247.chat/your-company) that customers can visit directly on any device. Additionally, the dashboard provides a copy-pasteable script widget that embeds a modern bottom-right support chat bubble on any external website or Shopify storefront. All chats use WebSockets to stream answers in real time with minimal latency.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { title: 'Tailored Subdomain', desc: 'Clean, dedicated branded URL for direct customer visits on all browsers.' },
                  { title: 'Copy Embed Code', desc: 'Lightweight JS script snippet that loads the chat bubble without slowing your site.' },
                  { title: 'WebSocket Streaming', desc: 'Low-latency streaming that renders responses line-by-line instantly.' }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col">
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-rose-500" /> {item.title}
                    </h4>
                    <p className="text-slate-400 text-[11px] leading-relaxed font-semibold">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <div className="w-full max-w-[280px] p-6 rounded-2xl bg-white/5 border border-white/5 flex flex-col shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Live & Active</span>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-center mt-2">
                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Your Direct Link</span>
                  <span className="text-[11px] text-amber-500 font-extrabold truncate block">support247.chat/acme</span>
                </div>
                <button className="w-full bg-gradient-to-r from-amber-600 to-rose-500 hover:opacity-95 text-white font-extrabold text-[10px] uppercase tracking-widest py-2.5 rounded-xl transition-all shadow-md active:scale-95 mt-6">
                  Copy Embed Widget
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations Section (Beigish Light Block) ─────────────────────── */}
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
                <p className="text-slate-550 text-xs leading-relaxed font-semibold">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights (White Block) */}
      <section className="px-6 md:px-12 py-24 bg-white border-b border-amber-200/20">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-black text-slate-900 text-center mb-10">Key Capabilities to Grow Your Business</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              ['Smart Automatic Answers', 'Questions are checked instantly and answered by the right help automatically.'],
              ['Direct Source Verification', 'Answers specify exactly where they found their details in your business files.'],
              ['Plain Activity Reports', 'Get plain, easy-to-read graphs displaying your chat volumes and inquiries.'],
              ['Custom Subdomains', 'Receive a clean direct link tailored specifically to your name or company.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-4 items-start py-2">
                <CheckCircle2 className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm mb-1">{title}</h4>
                  <p className="text-slate-500 text-xs leading-relaxed font-semibold">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-24 bg-[#FAF7F0] border-b border-amber-200/20 flex flex-col items-center">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-3">Ready to build your custom chat?</h2>
          <p className="text-slate-500 text-xs md:text-sm mb-8 max-w-sm mx-auto font-semibold">No credit card required. Free tier includes all basic custom URL options.</p>
          <Link to="/app/login?tab=register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-md active:scale-95">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
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
