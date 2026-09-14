import { motion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

export function YulloDifferentiator() {
  return (
    <section className="py-24 px-6 relative z-20 max-w-6xl mx-auto text-center">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight max-w-3xl mx-auto"
      >
        The right people are already out there.
      </motion.h2>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay: 0.1 }}
        className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed space-y-3 font-normal"
      >
        <p>Someone is looking for the thing you’re building.</p>
        <p>Someone needs the skill you’ve spent years developing.</p>
        <p>Someone is exploring an idea you care deeply about.</p>
        <p className="pt-2 font-semibold text-slate-800">
          The problem has never been that these people don't exist. It's that finding each other is still too hard.
        </p>
      </motion.div>

      <div className="mt-6 inline-block rounded-full bg-blue-50 border border-blue-200/80 px-6 py-2 text-sm font-bold text-blue-900 shadow-sm">
        Yullo is built for that moment of connection.
      </div>

      {/* 3-Tier Flow Diagram */}
      <div className="mt-16 max-w-3xl mx-auto flex flex-col items-center gap-6">
        {/* Tier 1: YOU / BUSINESS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-left flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">LAYER 01</div>
            <div className="text-lg font-bold text-[#101828] mt-0.5">YOU / BUSINESS</div>
            <div className="text-xs text-slate-500 mt-1">Creator, Studio, Enterprise, Idea</div>
          </div>
          <div className="h-3 w-3 rounded-full bg-slate-400" />
        </motion.div>

        {/* Pulse Arrow 1 */}
        <div className="flex flex-col items-center text-blue-500">
          <ArrowDown className="h-6 w-6 animate-bounce" />
        </div>

        {/* Tier 2: AURA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-lg rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 to-cyan-50/80 p-6 shadow-md text-left flex items-center justify-between relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">LAYER 02 — YOUR AURA</div>
            <div className="text-lg font-bold text-[#101828] mt-0.5">AI Understands Your World</div>
            <div className="text-xs text-slate-600 mt-1">Grounded Knowledge Base & Interactive Guidance</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-[#101828] p-1.5 flex items-center justify-center shadow-sm relative z-10">
            <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-7 w-auto object-contain" />
          </div>
        </motion.div>

        {/* Pulse Arrow 2 */}
        <div className="flex flex-col items-center text-blue-500">
          <ArrowDown className="h-6 w-6 animate-bounce" />
        </div>

        {/* Tier 3: THE YULLO NETWORK */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-lg rounded-2xl border border-slate-900 bg-[#101828] p-6 shadow-xl text-left text-white flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-[#4CD8FF] uppercase tracking-wider">LAYER 03</div>
            <div className="text-lg font-bold text-white mt-0.5">YULLO NETWORK</div>
            <div className="text-xs text-slate-300 mt-1">Connected People • Ideas • Opportunities</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4CD8FF]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#6695FF]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#A98CFF]" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
