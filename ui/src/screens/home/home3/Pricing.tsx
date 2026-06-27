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
    iconColor: 'bg-amber-600/10 text-amber-700',
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
    iconColor: 'bg-amber-600 text-white',
    features:  ['20,000 messages / month', 'Unlimited active agents', '10 GB knowledge base', 'Full analytics dashboard', 'Source citations in chat', 'Custom agent prompts', 'Session history', 'Priority support'],
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
    iconColor: 'bg-amber-600/10 text-amber-700',
    features:  ['Unlimited messages', 'Unlimited agents', 'Unlimited storage', 'Advanced analytics + export', 'Custom integrations', 'SSO / SAML', 'SLA guarantee', 'Dedicated support'],
  },
]

const COMPARE = [
  { label: 'Messages / month',       starter: '500',         pro: '20,000',    ent: 'Unlimited'       },
  { label: 'Active agents',          starter: '3',           pro: 'Unlimited', ent: 'Unlimited'       },
  { label: 'Knowledge base',         starter: '1 GB',        pro: '10 GB',     ent: 'Unlimited'       },
  { label: 'Branded chat page',      starter: true,          pro: true,         ent: true              },
  { label: 'Source citations',       starter: false,         pro: true,         ent: true              },
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
  { q: 'Can I bring my own API key?',             a: 'Enterprise plan only. Bring your own LLM key and we route through it.' },
  { q: 'Is my data used to train models?',        a: 'Never. Your data stays private to your organization and is never used for training.' },
]

function Cell({ value }: { value: string | boolean }) {
  if (value === true)  return <Check className="w-4 h-4 mx-auto text-rose-500" />
  if (value === false) return <Minus className="w-4 h-4 mx-auto opacity-20 text-slate-350" />
  return <span className="text-xs text-slate-300 font-semibold">{value as string}</span>
}

export function Pricing3() {
  const font = { fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif" }

  return (
    <div className="text-slate-800 bg-[#FAF7F0]" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', ...font }}>

      {/* Navbar */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-5 border-b border-amber-200/30 bg-[#FAF7F0]/85 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover shadow-sm shadow-amber-500/10" />
          <span className="font-extrabold text-slate-900 tracking-tight text-sm md:text-base">SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-wider uppercase text-slate-500">
          <Link to="/"            className="hover:text-amber-700 transition-colors">Home</Link>
          <Link to="/how-it-works" className="hover:text-amber-700 transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-amber-700 transition-colors">Features</Link>
          <Link to="/pricing"      className="text-amber-700 transition-colors">Pricing</Link>
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

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-8 text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-64 pointer-events-none bg-amber-400/5 blur-3xl" />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] mb-4 text-rose-500">Pricing Plans</p>
          <h1 className="text-2xl md:text-3xl font-black mb-3 tracking-tight text-slate-900 leading-none">
            Simple, clear pricing
          </h1>
          <p className="text-xs md:text-sm max-w-md mx-auto text-slate-500 font-semibold leading-relaxed">
            Start for free. Grow your custom space as you need. No contract required.
          </p>
        </div>
      </section>


      {/* Plan cards - completely flat design, zero card borders or heavy boxy containers */}
      <section className="px-6 pb-24 bg-[#FAF7F0]">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
          {PLANS.map(plan => (
            <div key={plan.name} className="relative flex flex-col p-4 pt-12">
              {plan.badge && (
                <div className="absolute top-2 left-4 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-700 border border-rose-200/50">
                  {plan.badge}
                </div>
              )}

              {/* Icon + name */}
              <div className="flex items-center gap-3 mb-5 mt-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${plan.iconColor} flex-shrink-0 shadow-sm`}>
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-lg font-black text-slate-900 tracking-tight">{plan.name}</span>
              </div>

              <p className="text-xs mb-6 leading-relaxed text-slate-500 font-semibold">{plan.desc}</p>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black tracking-tight text-slate-900 leading-none">{plan.price}</span>
                  {plan.period && <span className="text-sm mb-1 text-slate-400 font-bold">{plan.period}</span>}
                </div>
                <p className="text-[10px] uppercase font-bold tracking-wider mt-1.5 text-slate-400">{plan.sub}</p>
              </div>

              {/* CTA */}
              <Link to="/app/login?tab=register"
                className={`block text-center text-xs font-black uppercase tracking-widest py-3 rounded-xl mb-8 transition-all shadow-md active:scale-95 ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white hover:opacity-95'
                    : 'bg-black/5 text-slate-650 hover:bg-black/10 border border-black/5'
                }`}
              >
                {plan.cta}
              </Link>


              {/* Features list - completely flat, beautiful clean amber dots */}
              <ul className="space-y-3.5 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-slate-600 font-semibold">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table - high contrast obsidian dark block to avoid cream washout */}
      <section className="px-6 py-24 bg-[#12131a] text-white border-t border-b border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xs uppercase font-extrabold text-amber-500 tracking-[0.25em] text-center mb-3">Compare details</h2>
          <h3 className="text-3xl font-extrabold text-white text-center mb-12 tracking-tight">Full feature breakdown</h3>
          
          <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#181922]">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.name} className="px-5 py-4 text-center text-xs font-bold uppercase tracking-wider"
                      style={{ color: p.highlight ? '#f43f5e' : '#fff' }}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.label}
                    className="border-b border-white/5 last:border-0"
                    style={{ background: i % 2 !== 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td className="px-5 py-3.5 text-xs text-slate-400 font-semibold">{row.label}</td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.starter} /></td>
                    <td className="px-5 py-3.5 text-center bg-rose-500/5"><Cell value={row.pro} /></td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.ent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-24 bg-[#FAF7F0] border-b border-amber-200/20">
        <div className="max-w-2xl mx-auto pt-20">
          <h2 className="text-xs uppercase font-extrabold text-rose-500 tracking-[0.25em] text-center mb-3">Support FAQ</h2>
          <h3 className="text-3xl font-black text-slate-900 text-center mb-12 tracking-tight">Frequently Asked Questions</h3>
          <div className="divide-y divide-amber-200/20">
            {FAQS.map((faq, i) => (
              <div key={i} className="py-6">
                <p className="font-extrabold mb-2 text-sm text-slate-800 leading-snug">{faq.q}</p>
                <p className="text-xs leading-relaxed text-slate-500 font-semibold">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-24 bg-[#FAF7F0] flex flex-col items-center">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-3">Ready to build your custom chat?</h2>
          <p className="text-slate-500 text-xs md:text-sm mb-8 max-w-sm mx-auto font-medium">No credit card required. Free tier includes all basic custom URL options.</p>
          <Link to="/app/login?tab=register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-md active:scale-95">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-amber-200/20 text-slate-500 px-6 md:px-12 py-12 bg-white text-[11px] flex flex-col md:flex-row items-center justify-between gap-3 font-semibold">
        <p>© {new Date().getFullYear()} SUPPORT247.chat</p>
        <div className="flex items-center gap-5">
          <Link to="/privacy" className="hover:text-slate-800 transition-colors">Privacy</Link>
          <Link to="/terms"   className="hover:text-slate-800 transition-colors">Terms</Link>
          <Link to="/contact" className="hover:text-slate-800 transition-colors">Contact</Link>
        </div>
      </footer>

    </div>
  )
}
