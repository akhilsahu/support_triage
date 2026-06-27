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
    iconColor: 'from-slate-500 to-slate-600',
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
    iconColor: 'from-indigo-500 to-violet-600',
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
    iconColor: 'from-purple-500 to-pink-600',
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
  if (value === true)  return <Check className="w-4 h-4 mx-auto" style={{ color: '#a78bfa' }} />
  if (value === false) return <Minus className="w-4 h-4 mx-auto opacity-20" style={{ color: '#fff' }} />
  return <span className="text-sm" style={{ color: '#d1d5db' }}>{value as string}</span>
}

export function Pricing1() {
  const font = { fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" }

  return (
    <div style={{ background: '#0d0f1c', minHeight: '100vh', display: 'flex', flexDirection: 'column', ...font }}>

      {/* Navbar */}
      <nav style={{ background: 'rgba(13,15,28,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        className="sticky top-0 z-40 flex items-center justify-between px-8 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-9 h-9 rounded-lg object-cover shadow-lg shadow-violet-500/30" />
          <span className="font-bold tracking-tight text-white">SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm text-gray-400">
          <Link to="/"            className="hover:text-white transition-colors">Home</Link>
          <Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-white transition-colors">Features</Link>
          <Link to="/pricing"      className="text-white font-semibold transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/app/login" className="text-sm text-gray-400 hover:text-white font-medium px-3 py-1.5 transition-colors">Sign in</Link>
          <Link to="/app/login?tab=register" className="text-sm font-semibold px-4 py-2 rounded-xl text-white transition-all bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25">
            Sign up free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-8 text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-64 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at top, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] mb-4 text-indigo-400">Pricing</p>
          <h1 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight text-white">
            Simple, transparent pricing
          </h1>
          <p className="text-xs md:text-sm max-w-md mx-auto text-gray-400">
            Start free. Scale when you need it. No hidden fees.
          </p>
        </div>
      </section>


      {/* Plan cards */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map(plan => (
            <div key={plan.name}
              className="relative flex flex-col rounded-3xl p-8"
              style={{
                background: plan.highlight
                  ? 'linear-gradient(160deg, rgba(67,56,202,0.35) 0%, rgba(109,40,217,0.2) 100%)'
                  : 'rgba(255,255,255,0.03)',
                border: plan.highlight
                  ? '1px solid rgba(99,102,241,0.45)'
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: plan.highlight ? '0 8px 40px rgba(99,102,241,0.15)' : 'none',
              }}>

              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white whitespace-nowrap bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25">
                  {plan.badge}
                </div>
              )}

              {/* Icon + name */}
              <div className="flex items-center gap-3 mb-5 mt-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${plan.iconColor} flex-shrink-0`}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">{plan.name}</span>
              </div>

              <p className="text-sm mb-6 leading-relaxed text-gray-400">{plan.desc}</p>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black tracking-tight text-white">{plan.price}</span>
                  {plan.period && <span className="text-base mb-2 text-gray-500">{plan.period}</span>}
                </div>
                <p className="text-xs mt-1 text-gray-650">{plan.sub}</p>
              </div>

              {/* CTA */}
              <Link to="/app/login?tab=register"
                className="block text-center text-sm font-bold py-3 rounded-xl mb-8 transition-all"
                style={plan.highlight
                  ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }
                  : { background: 'rgba(255,255,255,0.07)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.1)' }}>
                {plan.cta}
                {plan.highlight && <ArrowRight className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5" />}
              </Link>

              {/* Features */}
              <ul className="space-y-3 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 pb-24 border-t border-white/5 bg-[#0f1120]">
        <div className="max-w-4xl mx-auto pt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Compare plans</h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.name} className="px-5 py-4 text-center text-sm font-bold"
                      style={{ color: p.highlight ? '#c4b5fd' : '#fff' }}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.label}
                    className="border-b border-white/5"
                    style={{ background: i % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td className="px-5 py-3.5 text-sm text-gray-400">{row.label}</td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.starter} /></td>
                    <td className="px-5 py-3.5 text-center bg-indigo-500/5"><Cell value={row.pro} /></td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.ent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-24 bg-[#0d0f1c]">
        <div className="max-w-2xl mx-auto pt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Frequently asked questions</h2>
          <div>
            {FAQS.map((faq, i) => (
              <div key={i} className="py-6 border-b border-white/5">
                <p className="font-semibold mb-2 text-[15px] text-gray-100">{faq.q}</p>
                <p className="text-sm leading-relaxed text-gray-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 pb-24 border-t border-white/5 bg-[#0f1120]">
        <div className="max-w-2xl mx-auto pt-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Still not sure?</h2>
          <p className="text-sm mb-8 max-w-sm mx-auto text-gray-500">
            Start on the free plan — no credit card, no time limit.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/app/login?tab=register"
              className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-xl text-white transition-all bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25">
              Get started free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact"
              className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl transition-all text-gray-400 border border-white/10 hover:text-white">
              Talk to sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 text-gray-500 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs" style={{ background: '#07080f' }}>
        <p>© {new Date().getFullYear()} SUPPORT247.chat</p>
        <div className="flex items-center gap-5">
          <Link to="/privacy" className="hover:text-gray-300">Privacy</Link>
          <Link to="/terms"   className="hover:text-gray-300">Terms</Link>
          <Link to="/contact" className="hover:text-gray-300">Contact</Link>
        </div>
      </footer>

    </div>
  )
}
