import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

const LINKS = ['Website', 'Store', 'Instagram', 'Portfolio', 'Book', 'Contact', 'Products', 'LinkedIn']

export function YulloNextStep() {
  return (
    <section className="py-24 px-6 relative z-20 max-w-6xl mx-auto text-center border-t border-slate-200/80">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight max-w-3xl mx-auto"
      >
        The internet is changing quietly.
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay: 0.1 }}
        className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal"
      >
        The spaces people remember won't simply contain more information. They'll understand why someone arrived and help them move forward.
      </motion.p>

      <div className="mt-6 inline-block rounded-2xl bg-amber-50 border border-amber-200/80 px-6 py-2.5 text-xs sm:text-sm font-bold text-amber-900 shadow-sm">
        “This is your chance to build your place before that becomes ordinary.”
      </div>

      {/* Converging Link Visual */}
      <div className="mt-16 max-w-4xl mx-auto rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-[#F9FBFF] p-8 md:p-12 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-10 relative z-10">
          {/* Scattered Links Column */}
          <div className="flex flex-wrap justify-center md:flex-col gap-2.5 max-w-xs">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center md:text-left">
              Scattered Channels
            </div>
            <div className="flex flex-wrap gap-2">
              {LINKS.map(link => (
                <span
                  key={link}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200/80"
                >
                  {link}
                </span>
              ))}
            </div>
          </div>

          {/* Central Converged Aura Node */}
          <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-[#101828] text-white shadow-xl relative my-4 md:my-0 min-w-[200px]">
            <div className="h-14 w-14 rounded-2xl bg-white/10 p-2 flex items-center justify-center border border-white/20 shadow-md mb-2">
              <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-10 w-auto object-contain" />
            </div>
            <div className="text-base font-bold tracking-wide">AURA</div>
            <div className="text-xs text-slate-300 mt-1">Converges & Understands</div>
          </div>

          {/* 3 Intelligently Selected Next Steps */}
          <div className="flex flex-col gap-3 w-full md:w-64 text-left">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              3 Intelligent Next Steps
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3.5 flex items-center justify-between text-xs font-semibold text-blue-900">
              <span>Work with Northstar Studio</span>
              <ArrowRight className="h-3.5 w-3.5 text-blue-600" />
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-3.5 flex items-center justify-between text-xs font-semibold text-cyan-900">
              <span>Explore recent SaaS portfolio</span>
              <ArrowRight className="h-3.5 w-3.5 text-cyan-600" />
            </div>

            <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-3.5 flex items-center justify-between text-xs font-semibold text-violet-900">
              <span>Ask a custom inquiry</span>
              <ArrowRight className="h-3.5 w-3.5 text-violet-600" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
