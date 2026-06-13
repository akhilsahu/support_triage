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

export function HowItWorks1() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0d0f1c] text-slate-350" style={{
      fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif",
    }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-8 py-5 border-b border-white/5"
        style={{ background: 'rgba(13,15,28,0.80)', backdropFilter: 'blur(20px)' }}>
        <Link to="/" className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-9 h-9 rounded-lg object-cover shadow-lg shadow-violet-500/30" />
          <span className="font-bold text-white tracking-tight">SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm text-gray-400">
          <Link to="/"            className="hover:text-white transition-colors">Home</Link>
          <Link to="/how-it-works" className="text-white transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-white transition-colors">Features</Link>
          <Link to="/pricing"      className="hover:text-white transition-colors">Pricing</Link>
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

      {/* Header */}
      <div className="relative overflow-hidden px-8 pt-12 pb-10 text-center border-b border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[300px]"
            style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.03) 40%, transparent 65%)' }} />
        </div>
        
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight">How SUPPORT247.chat Works</h1>
        <p className="text-gray-400 max-w-xl mx-auto text-xs md:text-sm leading-relaxed">
          Learn how our dynamic vector engine processes PDF documentation and routes live, cited AI support conversations.
        </p>
      </div>



      {/* Content */}
      <main className="flex-1 px-8 py-16 max-w-5xl mx-auto w-full space-y-24">
        
        {/* Step 1 */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-8 space-y-6">
            <span className="text-xs uppercase font-extrabold text-indigo-400 tracking-wider">Step 01 / Data Ingestion</span>
            <h2 className="text-3xl font-bold text-white tracking-tight">Upload PDF support materials</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Our dynamic system digests user manuals, FAQs, or operational guides in PDF format. As soon as you upload the files, our backend splits the text into semantic layers and computes 384-dimensional dense vectors using a transformer embeddings model. These vectors are securely indexed inside PostgreSQL using the pgvector extension. When customer questions are asked, precise cosine similarity matching retrieves exactly the paragraphs needed to formulate the answer.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { title: 'Automatic Chunking', desc: 'Divides text logically to ensure instructions or guidelines are kept intact.' },
                { title: 'pgvector Indexing', desc: 'Stores embeddings in our custom PostgreSQL database for exact matching queries.' },
                { title: 'Dynamic Refreshing', desc: 'Re-indexing updates document content inside the agent knowledge base instantly.' }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-white uppercase flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" /> {item.title}
                  </h4>
                  <p className="text-gray-500 text-[11px] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="w-full max-w-[280px] p-6 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center text-center shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-white">Knowledge Ingestion</span>
              <span className="text-[10px] text-gray-500 mt-1">Accepts standard PDF formats</span>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-6">
                <div className="w-[85%] h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" />
              </div>
              <span className="text-[9px] text-indigo-400 font-semibold mt-2 uppercase tracking-wider">85% Processed</span>
            </div>
          </div>
        </section>

        {/* Step 2 */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-4 flex justify-center lg:justify-start order-2 lg:order-1">
            <div className="w-full max-w-[280px] p-6 rounded-3xl bg-white/5 border border-white/5 flex flex-col shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Agent Settings</h4>
                  <p className="text-[10px] text-gray-500">Retrieval Compliance</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[9px] uppercase font-bold text-gray-500 block mb-1">Tone & Voice</span>
                  <span className="text-xs text-gray-300">Strictly compliance, professional tone of voice.</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[9px] uppercase font-bold text-gray-500 block mb-1">Retrieval Boundary</span>
                  <span className="text-xs text-gray-300">Locked to uploaded files only.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6 order-1 lg:order-2">
            <span className="text-xs uppercase font-extrabold text-indigo-400 tracking-wider">Step 02 / Agent Orchestration</span>
            <h2 className="text-3xl font-bold text-white tracking-tight">Deploy autonomous support agents</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Design and direct your automated support agents within the admin dashboard. Define precise system guidelines and tone preferences (e.g. professional and clear support). All agents run under strict RAG boundaries. This ensures the assistant only speaks using the facts found inside your uploaded PDF files, completely preventing AI hallucinations or off-topic conversational chatter.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { title: 'Strict RAG Safety', desc: 'Forbids the agent from making up answers when guidelines are missing.' },
                { title: 'Custom Settings', desc: 'Configure specific prompts, greetings, style rules, and boundary logs.' },
                { title: 'Inbox Hand-off', desc: 'Integrated escalation automatically flags and transfers complex chats to human staff.' }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-white uppercase flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> {item.title}
                  </h4>
                  <p className="text-gray-500 text-[11px] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-8 space-y-6">
            <span className="text-xs uppercase font-extrabold text-indigo-400 tracking-wider">Step 03 / Channel Deployment</span>
            <h2 className="text-3xl font-bold text-white tracking-tight">Share your public link or embed script</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Take your support platform live in one click. Register to secure a clean, personalized branded subdomain (e.g., support247.chat/acme) that customers can visit directly on any browser. In addition, the console provides copy-pasteable HTML/JS script widget tags that load a modern bottom-right chat bubble on any page or Shopify store. All chats run over WebSockets to stream responses line-by-line with minimal latency.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { title: 'Branded Subdomain', desc: 'Dedicated URL optimized for direct customer communications and links.' },
                { title: 'JS Script Embed', desc: 'Lightweight script snippet that renders a chat bubble without slowing your site.' },
                { title: 'WebSocket Stream', desc: 'Streams agent responses token-by-token directly over active WebSockets.' }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-white uppercase flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 text-indigo-400" /> {item.title}
                  </h4>
                  <p className="text-gray-500 text-[11px] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="w-full max-w-[280px] p-6 rounded-3xl bg-white/5 border border-white/5 flex flex-col shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Live & Active</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center mt-2">
                <span className="text-[9px] uppercase font-bold text-gray-500 block mb-1">Your Subdomain</span>
                <span className="text-xs text-indigo-400 font-bold truncate block">support247.chat/acme</span>
              </div>
              <button className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/25 mt-6">
                Copy Embed Script
              </button>
            </div>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="mt-24 pt-16 border-t border-white/5">
          <div className="text-center mb-16">
            <h3 className="text-2xl font-bold text-white mb-3">Integrations</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto">Connect your support chatbot seamlessly to your entire product suite.</p>
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
              <div key={idx} className="p-6 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-start text-left hover:border-violet-500/30 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 flex-shrink-0">
                  <item.icon className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-white mb-2">{item.title}</h4>
                <p className="text-gray-400 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Highlights */}
        <section className="mt-20 pt-16 border-t border-white/5">
          <h3 className="text-2xl font-bold text-white text-center mb-10">Platform Core Capabilities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              ['Multi-agent routing', 'Triage agent reads intent and hands off to the right specialist automatically.'],
              ['RAG knowledge base', 'Upload docs, index automatically, get cited answers from real sources.'],
              ['Session history', 'Customers can restore previous conversations. Full session persistence.'],
              ['Markdown responses', 'AI responses render bold, italic, and lists beautifully.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-4 items-start py-4">
                <CheckCircle2 className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-white text-sm mb-1">{title}</h4>
                  <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* CTA */}
      <section className="px-8 py-20 border-t border-white/5" style={{ background: '#0f1120' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">Ready to scale your support?</h2>
          <p className="text-gray-400 mb-8 text-sm">Set up your support org in minutes. No credit card required.</p>
          <Link to="/app/login?tab=register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-xl shadow-indigo-500/20 text-sm">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 text-gray-500 px-8 pt-14 pb-8"
        style={{ background: '#07080f' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-7 h-7 rounded-md object-cover" />
                <span className="text-white font-semibold text-sm">SUPPORT247.chat</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-650 font-medium">AI-powered multi-agent support for modern businesses.</p>
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
