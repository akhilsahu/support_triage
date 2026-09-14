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
        className={`text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight max-w-3xl mx-auto ${yulloConfig.typography.headingClass}`}
      >
        The right people are already out there.
      </motion.h2>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay: 0.1 }}
        className="mt-6 text-lg sm:text-xl text-slate-700 max-w-2xl mx-auto leading-relaxed space-y-3 font-medium"
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

      {/* Clean Vertical Connection Flow (Unboxed) */}
      <div className="mt-16 max-w-2xl mx-auto flex flex-col items-center">
        {/* Step 1 */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-4 text-left w-full bg-white/60 border border-slate-200/80 rounded-2xl p-4 shadow-sm"
        >
          <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center font-extrabold text-xs text-slate-700">
            01
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Starting Point</div>
            <div className="text-sm font-bold text-[#101828]">YOU / YOUR BUSINESS</div>
          </div>
        </motion.div>

        {/* Pulse Connector Line */}
        <div className="h-10 w-0.5 bg-gradient-to-b from-slate-300 via-blue-400 to-blue-500 my-1" />

        {/* Step 2 */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="flex items-center justify-between text-left w-full bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-xl bg-[#101828] p-1 flex items-center justify-center">
              <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-5 w-auto object-contain" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">The Presence Layer</div>
              <div className="text-sm font-bold text-[#101828]">YOUR AURA WELCOMES VISITORS</div>
            </div>
          </div>
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
        </motion.div>

        {/* Pulse Connector Line */}
        <div className="h-10 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-slate-900 my-1" />

        {/* Step 3 */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between text-left w-full bg-[#101828] border border-slate-900 text-white rounded-2xl p-4 shadow-md"
        >
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-xl bg-[#FFDA2D] text-[#101828] font-extrabold flex items-center justify-center text-xs">
              03
            </div>
            <div>
              <div className="text-xs font-semibold text-[#4CD8FF] uppercase tracking-wider">The Result</div>
              <div className="text-sm font-bold text-white">RELEVANT CONNECTIONS OPEN NATURALLY</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#4CD8FF]" />
            <span className="h-2 w-2 rounded-full bg-[#FFDA2D]" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
