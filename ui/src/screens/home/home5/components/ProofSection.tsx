import { motion, useInView } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  DollarSign,
  FileText,
  Layers,
  MessageSquare,
  Shield,
  ShoppingBag,
  Zap,
} from 'lucide-react'

// Simple Number Ticker helper
function NumberTicker({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let start = 0
    const duration = 1500
    const stepTime = 20
    const steps = duration / stepTime
    const increment = value / steps

    const timer = setInterval(() => {
      start += increment
      if (start >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(start)
      }
    }, stepTime)

    return () => clearInterval(timer)
  }, [isInView, value])

  return (
    <span ref={ref} className="tabular-nums">
      {typeof value === 'number' && value % 1 !== 0 ? count.toFixed(1) : Math.floor(count)}
      {suffix}
    </span>
  )
}

const integrations = [
  { name: 'Shopify Store', icon: ShoppingBag, color: '#526B54' },
  { name: 'Zendesk Support', icon: MessageSquare, color: '#1C1C1C' },
  { name: 'Intercom Inbox', icon: Zap, color: '#4A4A4A' },
  { name: 'PostgreSQL DB', icon: Database, color: '#526B54' },
  { name: 'Stripe Billing', icon: DollarSign, color: '#1C1C1C' },
  { name: 'PDF & Notion Docs', icon: FileText, color: '#4A4A4A' },
  { name: 'Slack Alerts', icon: Layers, color: '#526B54' },
  { name: 'SOC2 & GDPR Safe', icon: Shield, color: '#1C1C1C' },
]

export function ProofSection() {
  return (
    <section className="w-full py-24 bg-white border-y border-[#E5E2DB]" aria-label="Social Proof and Integrations">
      <div className="w-full max-w-7xl mx-auto px-6">
        
        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          <div className="bg-[#FCFBF9] border border-[#E5E2DB] p-8 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#737373] mb-6 uppercase tracking-wider">
              <CheckCircle2 size={18} className="text-[#526B54]" />
              Instant Resolution
            </div>
            <div className="text-5xl font-bold text-[#1C1C1C] mb-4 tracking-tight">
              <NumberTicker value={72.4} suffix="%" />
            </div>
            <p className="text-sm text-[#4A4A4A] leading-relaxed">Ticket deflection rate achieved effortlessly, fully resolving queries without human touch.</p>
          </div>

          <div className="bg-[#FCFBF9] border border-[#E5E2DB] p-8 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#737373] mb-6 uppercase tracking-wider">
              <Clock size={18} className="text-[#1C1C1C]" />
              Response Speed
            </div>
            <div className="text-5xl font-bold text-[#1C1C1C] mb-4 tracking-tight">
              <NumberTicker value={1.8} suffix="s" />
            </div>
            <p className="text-sm text-[#4A4A4A] leading-relaxed">Average time to read, retrieve context, and deliver a grounded answer.</p>
          </div>

          <div className="bg-[#FCFBF9] border border-[#E5E2DB] p-8 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#737373] mb-6 uppercase tracking-wider">
              <DollarSign size={18} className="text-[#526B54]" />
              Cost Efficiency
            </div>
            <div className="text-5xl font-bold text-[#1C1C1C] mb-4 tracking-tight">
              $<NumberTicker value={14200} />
            </div>
            <p className="text-sm text-[#4A4A4A] leading-relaxed">Average monthly labor savings per team by deflecting repetitive tickets.</p>
          </div>
        </div>

        {/* Marquee Wrap */}
        <div className="text-center overflow-hidden">
          <p className="text-[10px] font-bold tracking-[0.1em] text-[#A3A3A3] mb-8 uppercase">
            Plugs seamlessly into your existing tech stack
          </p>
          
          <div className="relative w-full overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)' }}>
            <div className="flex w-max animate-marquee">
              {[...integrations, ...integrations].map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={index} className="inline-flex items-center gap-3 bg-[#FCFBF9] border border-[#E5E2DB] px-5 py-3 rounded-xl mr-6 text-sm font-semibold text-[#1C1C1C] shadow-sm">
                    <Icon size={18} style={{ color: item.color }} />
                    <span>{item.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
