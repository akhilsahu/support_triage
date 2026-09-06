import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useInView, motion } from 'framer-motion'
import { ArrowUpRight, Check } from 'lucide-react'
import { pricing } from '../content'
import { trackLanding } from '../analytics'
import { SectionHeading, SignupLink } from './Common'
import { usePricingTiers } from '../../../../hooks/usePricingTiers'

export function PricingSection() {
  const ref = useRef<HTMLDivElement>(null)
  const viewed = useRef(false)
  const inView = useInView(ref, { amount: 0.3 })
  const { packages } = usePricingTiers()

  useEffect(() => {
    if (inView && !viewed.current) {
      viewed.current = true
      trackLanding('pricing_viewed')
    }
  }, [inView])

  return (
    <section id="pricing" tabIndex={-1} className="w-full py-24 bg-[#FAFAFA]" ref={ref}>
      <div className="w-full max-w-7xl mx-auto px-6">
        <SectionHeading
          eyebrow="A SETUP THAT FITS YOUR TEAM"
          title={pricing.title}
          description={pricing.description}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mt-16">
          {packages.map((plan) => {
            const isHighlight = plan.name.toUpperCase() === 'GROWTH'
            const planId = plan.name.toLowerCase()
            const priceDisplay = plan.price !== undefined ? String(plan.price) : '$29'

            return (
              <motion.article
                key={plan.name}
                className={`flex flex-col p-8 rounded-3xl border transition-all ${
                  isHighlight
                    ? 'bg-white border-[#526B54] shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10 md:-translate-y-4'
                    : 'bg-[#FCFBF9] border-[#E5E2DB] shadow-sm'
                }`}
                whileHover={{ y: isHighlight ? -20 : -4, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
              >
                {isHighlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#526B54] text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <p className="text-[10px] font-bold tracking-widest uppercase text-[#A3A3A3] mb-4">{plan.name}</p>
                <h3 className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold text-[#1C1C1C] tracking-tight">{priceDisplay}</span>
                  <small className="text-xs font-medium text-[#737373]">USD / month</small>
                </h3>
                <p className="text-sm text-[#4A4A4A] mb-8 min-h-[40px]">{plan.subhead}</p>

                {planId === 'scale' ? (
                  <Link
                    to="/contact"
                    className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#1C1C1C] text-white text-sm font-semibold rounded-xl hover:bg-[#333333] transition-all shadow-sm mb-8"
                  >
                    Contact sales
                    <ArrowUpRight size={17} />
                  </Link>
                ) : (
                  <SignupLink
                    placement={`pricing-${planId}`}
                    plan={planId as any}
                    className="w-full mb-8 bg-[#526B54] text-white hover:bg-[#435745]"
                  />
                )}

                <ul className="flex flex-col gap-3 mt-auto">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-[#4A4A4A]">
                      <Check size={16} className={`shrink-0 mt-0.5 ${isHighlight ? 'text-[#526B54]' : 'text-[#A3A3A3]'}`} />
                      <span className="leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            )
          })}
        </div>

        <p className="text-center text-xs text-[#737373] mt-12 max-w-xl mx-auto">
          Prices in USD, billed monthly. Included usage and billing arrangements
          are confirmed with our team. Creating an account does not start a paid
          subscription.
        </p>
      </div>
    </section>
  )
}

