import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

export function YulloFinalCTA() {
  return (
    <section className="py-32 px-6 bg-[#0B1020] text-white relative overflow-hidden text-center">
      {/* Background Visual Yellow Y glow & subtle network nodes */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-[#FFDA2D]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
        {/* Central Glowing Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="h-20 w-20 rounded-3xl bg-white/10 p-3 flex items-center justify-center shadow-2xl border border-white/20 mb-8"
        >
          <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-14 w-auto object-contain" />
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className={`text-4xl sm:text-6xl font-bold tracking-tight text-white max-w-3xl leading-tight ${yulloConfig.typography.headingClass}`}
        >
          Somewhere out there, someone is looking for what you do.
        </motion.h2>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl font-normal leading-relaxed"
        >
          <span className="block font-bold text-[#FFDA2D] mb-2 text-xl sm:text-2xl">Be easier to find. Harder to forget.</span>
          Bring your work, your ideas and your story into one place — and give the right people a better way to reach you.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="#claim"
            className="inline-flex items-center gap-2.5 rounded-2xl bg-[#FFDA2D] px-8 py-4 text-base font-bold text-[#101828] shadow-xl transition-all duration-200 hover:bg-[#ffe156] active:scale-[0.98]"
          >
            <span>Claim your Yullo Link</span>
            <ArrowRight className="h-5 w-5 text-[#101828]" />
          </a>
          <a
            href="#network"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-8 py-4 text-base font-semibold text-slate-200 backdrop-blur-md transition-all duration-200 hover:bg-slate-800 hover:text-white"
          >
            <span>Explore connected spaces</span>
          </a>
        </motion.div>

        {/* Visitor Node Arrival Tagline */}
        <div className="mt-14 inline-flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="h-2 w-2 rounded-full bg-[#FFDA2D] animate-ping" />
          <span>Your place is waiting on the Yullo Network.</span>
        </div>
      </div>
    </section>
  )
}
