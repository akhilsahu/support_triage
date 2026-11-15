import { motion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'

import { yulloConfig } from '../config'

export function YulloDifferentiator() {
  return (
    <section className="py-24 px-6 relative z-20 max-w-6xl mx-auto text-center">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        className={`text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight max-w-3xl mx-auto ${yulloConfig.typography.headingClass}`}
      >
        The right people are already out there.
      </motion.h2>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay: 0.1 }}
        className="mt-6 text-xl sm:text-2xl text-slate-900 max-w-2xl mx-auto leading-relaxed space-y-3 font-medium"
      >
        <p>Someone is looking for the thing you’re building.</p>
        <p>Someone needs the skill you’ve spent years developing.</p>
        <p>Someone is exploring an idea you care deeply about.</p>
        <p className="pt-2 font-semibold text-slate-800">
          The problem has never been that these people don't exist. It's that finding each other is still too hard.
        </p>
      </motion.div>

      {/* Clean Organic Discovery Connection Flow (Unboxed Nodes) */}
      <div className="mt-16 max-w-2xl mx-auto flex flex-col items-center">
        {/* Node 1: Intent */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-4 text-left w-full p-2"
        >
          <div className="h-3 w-3 rounded-full bg-[#FFFC00] shrink-0 shadow-sm" />
          <div className="flex-1 border-b border-slate-200/80 pb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">01 / Intent</div>
              <div className="text-base font-bold text-[#101828]">YOU & YOUR WORK</div>
            </div>
            <div className="text-xs text-slate-500 font-mono">yullo.co/link</div>
          </div>
        </motion.div>

        {/* Pulse Connector Beam */}
        <div className="h-8 w-0.5 bg-gradient-to-b from-[#FFFC00] via-blue-400 to-[#4CD8FF] my-1" />

        {/* Node 2: Presence */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-4 text-left w-full p-2"
        >
          <div className="h-3.5 w-3.5 rounded-full bg-[#4CD8FF] shrink-0 shadow-sm animate-pulse" />
          <div className="flex-1 border-b border-slate-200/80 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-lg bg-[var(--accent-solid)] p-1 flex items-center justify-center">
                <img src={yulloConfig.assets.logoTransparent} alt="Yullo Logo" className="h-4 w-auto object-contain" />
              </div>
              <div>
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">02 / Aura Alignment</div>
                <div className="text-base font-bold text-[#101828]">YOUR AURA WELCOMES VISITORS</div>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">Active Presence</span>
          </div>
        </motion.div>

        {/* Pulse Connector Beam */}
        <div className="h-8 w-0.5 bg-gradient-to-b from-[#4CD8FF] via-purple-400 to-[#6695FF] my-1" />

        {/* Node 3: Living Connection */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-4 text-left w-full p-2"
        >
          <div className="h-3 w-3 rounded-full bg-[#6695FF] shrink-0 shadow-sm" />
          <div className="flex-1 pb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wider">03 / Discovery</div>
              <div className="text-base font-bold text-[#101828]">RELEVANT CONNECTIONS OPEN NATURALLY</div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4CD8FF]" />
              <span className="h-2 w-2 rounded-full bg-[#FFFC00]" />
              <span className="h-2 w-2 rounded-full bg-[#A98CFF]" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
