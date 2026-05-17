import { Link } from 'react-router-dom'
import { Check, Zap, ArrowRight, Minus } from 'lucide-react'
import { IMAGES } from '../config/images.config'

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

export function Pricing() {
  const font = { fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" }

  return (
    <div style={{ background: '#0d0f1c', minHeight: '100vh', display: 'flex', flexDirection: 'column', ...font }}>

      {/* Navbar */}
      <nav style={{ background: 'rgba(13,15,28,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        className="sticky top-0 z-40 flex items-center justify-between px-8 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-bold tracking-tight" style={{ color: '#fff' }}>SUPPORT247.chat</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm" style={{ color: '#9ca3af' }}>
          <Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link to="/features"     className="hover:text-white transition-colors">Features</Link>
          <Link to="/pricing"      style={{ color: '#fff', fontWeight: 600 }}>Pricing</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium transition-colors hover:text-white px-3 py-1.5" style={{ color: '#9ca3af' }}>Sign in</Link>
          <Link to="/login" className="text-sm font-semibold px-4 py-2 rounded-xl text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
            Sign up free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 pt-24 pb-16 text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-64 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at top, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] mb-4" style={{ color: '#818cf8' }}>Pricing</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight" style={{ color: '#fff' }}>
            Simple, transparent pricing
          </h1>
          <p className="text-lg max-w-md mx-auto" style={{ color: '#6b7280' }}>
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
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
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

              <p className="text-sm mb-6 leading-relaxed" style={{ color: '#6b7280' }}>{plan.desc}</p>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black tracking-tight" style={{ color: '#fff' }}>{plan.price}</span>
                  {plan.period && <span className="text-base mb-2" style={{ color: '#6b7280' }}>{plan.period}</span>}
                </div>
                <p className="text-xs mt-1" style={{ color: '#4b5563' }}>{plan.sub}</p>
              </div>

              {/* CTA */}
              <Link to="/login"
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
                  <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: '#d1d5db' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#a78bfa' }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 pb-24" style={{ background: '#0f1120', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-4xl mx-auto pt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Compare plans</h2>
          <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b7280' }}>Feature</th>
                  {PLANS.map(p => (
                    <th key={p.name} className="px-5 py-4 text-center text-sm font-bold"
                      style={{ color: p.highlight ? '#c4b5fd' : '#fff' }}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.label}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td className="px-5 py-3.5 text-sm" style={{ color: '#9ca3af' }}>{row.label}</td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.starter} /></td>
                    <td className="px-5 py-3.5 text-center" style={{ background: 'rgba(99,102,241,0.05)' }}><Cell value={row.pro} /></td>
                    <td className="px-5 py-3.5 text-center"><Cell value={row.ent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-24" style={{ background: '#0d0f1c' }}>
        <div className="max-w-2xl mx-auto pt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Frequently asked questions</h2>
          <div>
            {FAQS.map((faq, i) => (
              <div key={i} className="py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-semibold mb-2 text-[15px]" style={{ color: '#f9fafb' }}>{faq.q}</p>
                <p className="text-sm leading-relaxed" style={{ color: '#6b7280' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 pb-24" style={{ background: '#0f1120', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-2xl mx-auto pt-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Still not sure?</h2>
          <p className="text-sm mb-8 max-w-sm mx-auto" style={{ color: '#6b7280' }}>
            Start on the free plan — no credit card, no time limit.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/login"
              className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-xl text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 24px rgba(99,102,241,0.35)' }}>
              Get started free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact"
              className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl transition-all hover:text-white"
              style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}>
              Talk to sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3"
        style={{ background: '#07080f', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs" style={{ color: '#374151' }}>© {new Date().getFullYear()} SUPPORT247.chat. All rights reserved.</p>
        <div className="flex items-center gap-5">
          {[['Privacy','/privacy'],['Terms','/terms'],['Contact','/contact']].map(([l,t]) => (
            <Link key={l} to={t} className="text-xs transition-colors hover:text-gray-400" style={{ color: '#374151' }}>{l}</Link>
          ))}
        </div>
      </footer>
    </div>
  )
}
