import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { yulloConfig } from '../config'

export function YulloHero() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window
      setMousePos({
        x: (e.clientX / innerWidth - 0.5) * 2,
        y: (e.clientY / innerHeight - 0.5) * 2,
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-center items-center py-16 px-6 text-center overflow-hidden">
      {/* Background Watermark Logo with subtle parallax */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none transition-transform duration-300 ease-out opacity-[0.06] flex items-center justify-center"
        style={{
          transform: `translate(calc(-50% + ${mousePos.x * 6}px), calc(-50% + ${mousePos.y * 6}px))`,
        }}
      >
        <img src={yulloConfig.assets.logo} alt="Yullo Logo Watermark" className="w-[480px] h-[480px] object-contain" />
      </div>

      <div className="page-shell relative z-10 flex flex-col items-center">
        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className={`hero-title font-bold tracking-tight text-[#101828] copy-medium mx-auto ${yulloConfig.typography.headingClass}`}
        >
          Make your place on the internet feel{' '}
          <span className="relative inline-block text-[#101828]">
            <span className="relative z-10">alive.</span>
            {/* Subtle traveling pulse under alive */}
            <motion.span
              animate={{
                opacity: [0.3, 0.8, 0.3],
                scaleX: [0.95, 1.05, 0.95],
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute bottom-1.5 left-0 right-0 h-3.5 bg-[#FFDA2D]/40 -z-10 rounded-sm"
            />
          </span>
        </motion.h1>

        {/* Supporting Text */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 body-lg text-slate-700 copy-narrow mx-auto leading-relaxed font-normal"
        >
          You’ve built something worth discovering. Give people a place where they can understand what you do, explore what matters, and find their way closer to you.
        </motion.p>

        {/* CTAs & Handle Pill */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#claim"
            onClick={e => {
              e.preventDefault()
              document.querySelector('#claim')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="control inline-flex items-center gap-2.5 rounded-2xl bg-[var(--accent-solid)] px-7 py-3 text-base font-semibold text-[var(--accent-on-solid)] shadow-lg transition-all duration-200 hover:opacity-90 hover:shadow-xl active:scale-[0.98]"
          >
            <span>Claim your Yullo Link</span>
            <ArrowRight className="h-5 w-5 text-[#FFDA2D]" />
          </a>

          <div className="control inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-medium text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-slate-700 font-semibold">yullo.co/northstarstudio</span>
          </div>
        </motion.div>

        {/* Light Subtext Target Domains */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="mt-12 text-xs sm:text-sm font-medium text-slate-400 tracking-widest uppercase"
        >
          People · Ideas · Businesses · Opportunities
        </motion.div>
      </div>
    </section>
  )
}
