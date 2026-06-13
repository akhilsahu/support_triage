import { Link } from 'react-router-dom'
import { Check, Zap, ArrowRight, Minus } from 'lucide-react'
import { IMAGES } from '../../../config/images.config'

const PLANS = [
  {
    name:      'Starter',
    price:     '$0',
    period:    '/mo',
    sub:       'Free forever',
    desc:      'Perfect for small teams getting started.',
    highlight: false,
    badge:     null,
    cta:       'Get started free',
    iconColor: 'from-slate-600 to-slate-500',
    features:  ['500 messages / month', '3 active agents', '1 GB knowledge base', 'Basic analytics', 'Branded chat page', 'Community support'],
  },
  {
    name:      'Pro',
    price:     '$49',
    period:    '/mo',
    sub:       'Billed monthly',
    desc:      'For growing businesses with real volume.',
    highlight: true,
    badge:     'Most popular',
    cta:       'Start free trial',
    iconColor: 'from-violet-650 to-indigo-650',
    features:  ['20,000 messages / month', 'Unlimited active agents', '10 GB knowledge base', 'Full analytics dashboard', 'RAG citations in chat', 'Custom agent prompts', 'Session history', 'Priority support'],
  },
  {
    name:      'Enterprise',
    price:     'Custom',
    period:    '',
    sub:       'Contact us',
    desc:      'For large-scale deployments with SLA needs.',
    highlight: false,
    badge:     null,
    cta:       'Talk to sales',
    iconColor: 'from-fuchsia-600 to-pink-600',
    features:  ['Unlimited messages', 'Unlimited agents', 'Unlimited storage', 'Advanced analytics + export', 'Custom integrations', 'SSO / SAML', 'SLA guarantee', 'Dedicated support'],
  },
]

const COMPARE = [
  { label: 'Messages / month',       starter: '500',         pro: '20,000',    ent: 'Unlimited'       },
  { label: 'Active agents',          starter: '3',           pro: 'Unlimited', ent: 'Unlimited'       },
  { label: 'Knowledge base',         starter: '1 GB',        pro: '10 GB',     ent: 'Unlimited'       },
  { label: 'Branded chat page',      starter: true,          pro: true,         ent: true              },
  { label: 'RAG citations',          starter: false,         pro: true,         ent: true              },
  { label: 'Custom agent prompts',   starter: false,         pro: true,         ent: true              },
  { label: 'Session history',        starter: false,         pro: true,         ent: true              },
  { label: 'Analytics',              starter: 'Basic',       pro: 'Full',      ent: 'Advanced'        },
  { label: 'Custom integrations',    starter: false,         pro: false,        ent: true              },
  { label: 'SSO / SAML',            starter: false,         pro: false,        ent: true              },
  { label: 'SLA guarantee',         starter: false,         pro: false,        ent: true              },
  { label: 'Support',                starter: 'Community',   pro: 'Priority',  ent: 'Dedicated'       },
]

const FAQS = [
  { q: 'Can I change plans at any time?',         a: 'Yes. Upgrade or downgrade anytime. Changes are immediate and prorated.' },
  { q: 'What happens when I hit my message limit?', a: 'On Starter, agents reply with a rate-limit message. Upgrade instantly to restore full access.' },
  { q: 'Is there a free trial on Pro?',           a: '14 days free, no credit card required. Add payment details after the trial to continue.' },
  { q: 'What counts as a message?',               a: 'Each customer message counts as one. Agent replies do not count toward your limit.' },
  { q: 'Can I bring my own LLM API key?',         a: 'Enterprise plan only. Bring your own OpenAI or Anthropic key and we route through it.' },
  { q: 'Is my data used to train models?',        a: 'Never. Your data stays private to your organization and is never used for training.' },
]

function Cell({ value }: { value: string | boolean }) {
  if (value === true)  return <Check className="w-4 h-4 mx-auto text-violet-400" />
  if (value === false) return <Minus className="w-4 h-4 mx-auto opacity-20 text-slate-500" />
  return <span className="text-sm text-slate-350">{value as string}</span>
}

export function Pricing2() {
  const font = { fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif" }

  return (
    <div className="text-slate-100" style={{ background: '#090a15', minHeight: '100vh', display: 'flex', flexDirection: 'column', ...font }}>

      {/* Navbar */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5 backdrop-blur-md bg-[#090a15]/75">
        <Link to="/" className="flex items-center gap-3">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-md shadow-violet-500/20" />
          <span className="font-bold text-white tracking-tight text-sm md:text-base">SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wider uppercase text-slate-400">
          <Link to="/"            className="hover:text-white transition-colors">Home</Link>
          <Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-white transition-colors">Features</Link>
          <Link to="/pricing"      className="text-white font-semibold transition-colors">Pricing</Link>
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

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-8 text-center overflow-hidden">
        <div className="absolute top-0 right-[-10%] w-[600px] h-[300px] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] mb-4 text-violet-400">Pricing</p>
          <h1 className="text-2xl md:text-3xl font-black mb-3 tracking-tight text-white leading-none">
            Simple, transparent pricing
          </h1>
          <p className="text-xs md:text-sm max-w-md mx-auto text-slate-400 mt-2 leading-relaxed">
            Start free. Scale when you need it. No hidden fees.
          </p>
        </div>
      </section>


      {/* Plan cards */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {PLANS.map(plan => (
            <div key={plan.name}
              className="relative flex flex-col rounded-3xl p-8 bg-slate-900/40 border border-white/5 hover:border-violet-500/25 transition-all duration-300 shadow-xl"
              style={plan.highlight ? { borderColor: 'rgba(139,92,246,0.3)', boxShadow: '0 8px 40px rgba(139,92,246,0.05)' } : {}}>

              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md">
                  {plan.badge}
                </div>
              )}

              {/* Icon + name */}
              <div className="flex items-center gap-3 mb-5 mt-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${plan.iconColor} flex-shrink-0 shadow-inner`}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-white uppercase tracking-wider">{plan.name}</span>
              </div>

              <p className="text-xs mb-6 leading-relaxed text-slate-400">{plan.desc}</p>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black tracking-tight text-white leading-none">{plan.price}</span>
                  {plan.period && <span className="text-base mb-1 text-slate-500 font-semibold">{plan.period}</span>}
                </div>
                <p className="text-[10px] uppercase font-bold tracking-wider mt-1 text-slate-650">{plan.sub}</p>
              </div>

              {/* CTA */}
              <Link to="/app/login?tab=register"
                className="block text-center text-xs font-bold uppercase tracking-wider py-3 rounded-xl mb-8 transition-all active:scale-[0.97]"
                style={plan.highlight
                  ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }
                  : { background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)' }}>
                {plan.cta}
                {plan.highlight && <ArrowRight className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5" />}
              </Link>

              {/* Features */}
              <ul className="space-y-3.5 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-slate-300">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 py-24 border-t border-white/5 bg-slate-950/20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-12 uppercase tracking-wide">Compare plans</h2>
          <div className="overflow-x-auto rounded-3xl border border-white/5 bg-[#090b16]/30">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-slate-900/60 border-b border-white/5">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.name} className="px-5 py-4 text-center text-xs font-bold uppercase tracking-wider"
                      style={{ color: p.highlight ? '#c4b5fd' : '#fff' }}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.label}
                    className="border-b border-white/5 last:border-0"
                    style={{ background: i % 2 !== 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td className="px-5 py-3.5 text-xs text-slate-400">{row.label}</td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.starter} /></td>
                    <td className="px-5 py-3.5 text-center bg-violet-500/5"><Cell value={row.pro} /></td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.ent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-24 bg-[#090a15] border-t border-white/5">
        <div className="max-w-2xl mx-auto pt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12 uppercase tracking-wide">Frequently asked questions</h2>
          <div className="divide-y divide-white/5">
            {FAQS.map((faq, i) => (
              <div key={i} className="py-6">
                <p className="font-semibold mb-2 text-[14px] text-gray-150">{faq.q}</p>
                <p className="text-xs leading-relaxed text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-20 bg-[#090a15] relative overflow-hidden flex flex-col items-center border-t border-white/5">
        <div className="max-w-4xl mx-auto w-full p-12 rounded-3xl bg-gradient-to-r from-violet-950/20 to-indigo-950/20 border border-white/10 flex flex-col items-center justify-center text-center relative z-10 backdrop-blur-xl">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Deploy your customer support agents today</h2>
          <p className="text-slate-400 text-xs md:text-sm mb-8 max-w-sm">No credit card required. Free tier includes all basic features.</p>
          <Link to="/app/login?tab=register"
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-600/30 active:scale-95">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 text-slate-500 px-6 md:px-12 py-12 bg-slate-950/60 text-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <p>© {new Date().getFullYear()} SUPPORT247.chat</p>
        <div className="flex items-center gap-5">
          <Link to="/privacy" className="hover:text-slate-350">Privacy</Link>
          <Link to="/terms"   className="hover:text-slate-350">Terms</Link>
          <Link to="/contact" className="hover:text-slate-350">Contact</Link>
        </div>
      </footer>

    </div>
  )
}
