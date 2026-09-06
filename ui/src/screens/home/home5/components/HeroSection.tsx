import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Calculator, CheckCircle2, ShieldCheck, Zap } from 'lucide-react'
import { SignupLink } from './Common'
import { SupportDemo } from './SupportDemo'
import { ROICalculator } from './ROICalculator'
import { AnimatedBackground } from './AnimatedBackground'

export function HeroSection() {
  const [heroMode, setHeroMode] = useState<'demo' | 'calc'>('demo')

  return (
    <section className="h5-hero relative isolate w-full mx-auto px-6 pt-32 pb-24 md:pt-40 md:pb-32 flex flex-col items-center text-center overflow-hidden">
      <AnimatedBackground />
      
      {/* Trust Tag */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFECE6] border border-[#E5E2DB] text-[#4A544A] text-xs font-semibold tracking-wide uppercase mb-8"
      >
        <span className="w-2 h-2 rounded-full bg-[#526B54] shadow-[0_0_8px_rgba(82,107,84,0.4)] animate-pulse" />
        AI Customer Support Platform
      </motion.div>

      {/* Main Headline */}
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        className="text-5xl md:text-7xl font-bold tracking-tight text-[#1C1C1C] max-w-4xl text-balance leading-[1.1]"
      >
        Resolve customer questions instantly with AI that <span className="text-[#526B54] relative inline-block">
          answers from
          <svg className="absolute -bottom-2 left-0 w-full text-[#526B54]/30 h-3" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0 10 Q 50 20 100 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" /></svg>
        </span> your business knowledge.
      </motion.h1>

      {/* Description */}
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        className="mt-6 text-lg md:text-xl text-[#4A4A4A] max-w-2xl text-balance"
      >
        Connect your Shopify store, help center, and internal docs in seconds. Give your customers perfectly grounded answers without the manual setup.
      </motion.p>

      {/* CTA Actions */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
        className="mt-10 flex flex-col items-center gap-4"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <SignupLink placement="hero" />
        </div>
        <div className="flex items-center gap-2 text-sm text-[#737373] mt-2">
          <ShieldCheck size={16} /> 14-day free trial · No credit card required
        </div>
      </motion.div>

      {/* Value Pillars */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
        className="mt-12 flex flex-wrap justify-center gap-6 md:gap-10 text-sm font-medium text-[#4A4A4A]"
      >
        <span className="flex items-center gap-2"><Zap size={16} className="text-[#D97706]" /> Instant Deflection</span>
        <span className="flex items-center gap-2"><Bot size={16} className="text-[#526B54]" /> 100% Grounded AI</span>
        <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#2563EB]" /> Seamless Human Handoff</span>
      </motion.div>

      {/* Interactive Sandbox */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
        className="h5-demo-frame w-full max-w-3xl mt-20"
      >
        {/* Toggle Tabs */}
        <div className="inline-flex bg-[#F2EFEB] p-1 rounded-2xl mb-8 border border-[#E5E2DB]">
          <button
            onClick={() => setHeroMode('demo')}
            className={`relative px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors ${heroMode === 'demo' ? 'text-[#1C1C1C]' : 'text-[#737373] hover:text-[#4A4A4A]'}`}
          >
            {heroMode === 'demo' && (
              <motion.div
                layoutId="heroTab"
                className="absolute inset-0 bg-white rounded-xl shadow-sm border border-[#E5E2DB]"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2"><Bot size={16} /> Live AI Demo</span>
          </button>
          <button
            onClick={() => setHeroMode('calc')}
            className={`relative px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors ${heroMode === 'calc' ? 'text-[#1C1C1C]' : 'text-[#737373] hover:text-[#4A4A4A]'}`}
          >
            {heroMode === 'calc' && (
              <motion.div
                layoutId="heroTab"
                className="absolute inset-0 bg-white rounded-xl shadow-sm border border-[#E5E2DB]"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2"><Calculator size={16} /> ROI Savings</span>
          </button>
        </div>

        {/* Sandbox Content Area */}
        <div className="w-full relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {heroMode === 'demo' ? (
              <motion.div
                key="demo"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <SupportDemo />
              </motion.div>
            ) : (
              <motion.div
                key="calc"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <ROICalculator />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  )
}
