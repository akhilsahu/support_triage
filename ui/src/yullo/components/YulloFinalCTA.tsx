import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { yulloConfig } from '../config'

export function YulloFinalCTA() {
  return (
    <section className="py-32 px-6 bg-[#0B1020] text-white relative overflow-hidden text-center">
      {/* Background Visual Yellow Y glow & subtle network nodes */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[#FFFC00]/10 blur-3xl pointer-events-none" />

      {/* Culminating Network Backdrop SVG */}
      <div className="absolute inset-0 pointer-events-none opacity-25 flex items-center justify-center">
        <svg className="w-full h-full max-w-5xl" viewBox="0 0 1000 600" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Faint Connection Lines */}
          <line x1="200" y1="150" x2="500" y2="300" stroke="#4CD8FF" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="800" y1="180" x2="500" y2="300" stroke="#6695FF" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="300" y1="450" x2="500" y2="300" stroke="#A98CFF" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="750" y1="420" x2="500" y2="300" stroke="#4CD8FF" strokeWidth="1" strokeDasharray="4 4" />
          {/* Active Golden Connection Line */}
          <motion.line
            x1="500"
            y1="300"
            x2="680"
            y2="280"
            stroke="#FFFC00"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.9 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.5, ease: 'easeOut' }}
          />

          {/* Dim Blue/Violet Outer Nodes */}
          <circle cx="200" cy="150" r="6" fill="#4CD8FF" opacity="0.6" />
          <circle cx="800" cy="180" r="7" fill="#6695FF" opacity="0.6" />
          <circle cx="300" cy="450" r="5" fill="#A98CFF" opacity="0.6" />
          <circle cx="750" cy="420" r="6" fill="#4CD8FF" opacity="0.6" />
          <circle cx="680" cy="280" r="7" fill="#FFFC00" opacity="0.9" />

          {/* Center Yullo Node */}
          <circle cx="500" cy="300" r="10" fill="#FFFC00" opacity="0.8" />
          <circle cx="500" cy="300" r="24" stroke="#FFFC00" strokeWidth="1.5" opacity="0.3" />
        </svg>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
        {/* Central Glowing Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="h-20 w-20 rounded-3xl bg-white/10 p-3 flex items-center justify-center shadow-2xl border border-white/20 mb-8"
        >
          <img src={yulloConfig.assets.logoTransparent} alt="Yullo Logo" className="h-14 w-auto object-contain" />
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
          <span className="block font-bold text-[#FFFC00] mb-2 text-xl sm:text-2xl">Be easier to find. Harder to forget.</span>
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
          <Link
            to="/yullo/auth?intent=claim"
            className="yullo-cta inline-flex items-center gap-2.5 rounded-2xl px-8 py-4 text-base font-bold shadow-xl transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
          >
            <span>Claim your Yullo Link</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            to="/yullo/explore"
            className="yullo-cta inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold transition-all duration-200 hover:opacity-90"
          >
            <span>Explore apps</span>
          </Link>
        </motion.div>

        {/* Visitor Node Arrival Tagline */}
        <div className="mt-14 inline-flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="h-2 w-2 rounded-full bg-[#FFFC00] animate-ping" />
          <span>Your place is waiting on the Yullo Network.</span>
        </div>
      </div>
    </section>
  )
}
