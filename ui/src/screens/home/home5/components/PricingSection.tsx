import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useInView, motion } from 'framer-motion'
import { ArrowUpRight, Check } from 'lucide-react'
import { plans, pricing } from '../content'
import { trackLanding } from '../analytics'
import { SectionHeading, SignupLink } from './Common'

export function PricingSection() {
  const ref = useRef<HTMLDivElement>(null)
  const viewed = useRef(false)
  const inView = useInView(ref, { amount: 0.3 })
  
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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-16">
          {plans.map((plan) => (
            <motion.article
              key={plan.id}
              className={`flex flex-col p-8 rounded-3xl border transition-all ${
                plan.id === 'growth' 
                ? 'bg-white border-[#526B54] shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10 md:-translate-y-4' 
                : 'bg-[#FCFBF9] border-[#E5E2DB] shadow-sm'
              }`}
              whileHover={{ y: plan.id === 'growth' ? -20 : -4, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
            >
              {plan.id === 'growth' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#526B54] text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#A3A3A3] mb-4">{plan.name}</p>
              <h3 className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-[#1C1C1C] tracking-tight">${plan.price}</span>
                <small className="text-xs font-medium text-[#737373]">USD / month</small>
              </h3>
              <p className="text-sm text-[#4A4A4A] mb-8 min-h-[40px]">{plan.description}</p>
              
              <SignupLink
                placement={`pricing-${plan.id}`}
                plan={plan.id as 'starter' | 'team'}
                className={`w-full mb-8 ${plan.id === 'starter' ? 'bg-[#F2EFEB] text-[#1C1C1C] hover:bg-[#E5E2DB]' : ''}`}
              />
              
              <ul className="flex flex-col gap-3 mt-auto">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-[#4A4A4A]">
                    <Check size={16} className={`shrink-0 mt-0.5 ${plan.id === 'growth' ? 'text-[#526B54]' : 'text-[#A3A3A3]'}`} />
                    <span className="leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
          
          <motion.article 
            className="flex flex-col p-8 rounded-3xl border border-[#E5E2DB] bg-[#FCFBF9] shadow-sm"
            whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
          >
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#A3A3A3] mb-4">SCALE</p>
            <h3 className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold text-[#1C1C1C] tracking-tight">$249</span>
              <small className="text-xs font-medium text-[#737373]">USD / month</small>
            </h3>
            <p className="text-sm text-[#4A4A4A] mb-8 min-h-[40px]">A bigger support operation? Let’s work through what you need.</p>
            
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#F2EFEB] text-[#1C1C1C] text-sm font-semibold rounded-xl hover:bg-[#E5E2DB] transition-all shadow-sm mb-8">
              Contact sales
              <ArrowUpRight size={17} />
            </Link>
            
            <ul className="flex flex-col gap-3 mt-auto">
              {[
                'Discuss your conversation volume',
                'Review your setup requirements',
                'Agree on a plan with our team',
              ].map((text) => (
                <li key={text} className="flex items-start gap-3 text-sm text-[#4A4A4A]">
                  <Check size={16} className="shrink-0 mt-0.5 text-[#A3A3A3]" />
                  <span className="leading-snug">{text}</span>
                </li>
              ))}
            </ul>
          </motion.article>
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
