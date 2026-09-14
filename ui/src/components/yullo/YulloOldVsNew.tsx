import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Check, Sparkles, Layers } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

const STAGES = [
  {
    id: 1,
    badge: 'THE PROBLEM',
    title: 'You showed up. You shared your work. And then you waited.',
    subtitle: 'A website can show what you’ve made. A profile can tell people who you are. But neither can notice why someone came, what they’re looking for, or where they should go next.',
    tagline: 'Too many meaningful connections end before they ever begin.',
    color: '#94a3b8',
  },
  {
    id: 2,
    badge: 'THE TRANSITION',
    title: 'What if people never had to feel lost when they found you?',
    subtitle: 'When someone enters your world, Yullo helps them understand it. What you’ve built. What you believe in. What you can offer. And where the two of you might connect.',
    tagline: 'A webpage waits. An Aura welcomes.',
    color: '#3b82f6',
  },
  {
    id: 3,
    badge: 'THE MOVEMENT',
    title: 'A webpage waits. An Aura welcomes.',
    subtitle: 'Aura turns your Yullo Link into a space that feels present. It learns your world and helps each visitor find what matters to them — without making them dig for it.',
    tagline: 'You’ve built something worth finding. Yullo helps the right people find their way to it.',
    color: '#FFDA2D',
  },
]

export function YulloOldVsNew() {
  const [activeStep, setActiveStep] = useState(1)

  return (
    <section id="how-it-works" className="py-24 px-6 relative z-20 max-w-5xl mx-auto border-t border-slate-200/80">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="text-left max-w-2xl">
          <h2 className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight leading-tight">
            You showed up.<br />
            You shared your work.<br />
            <span className="text-slate-400">And then you waited.</span>
          </h2>
        </div>

        {/* Step Tabs Indicator */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {STAGES.map(stage => {
            const isActive = activeStep === stage.id
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStep(stage.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-[#101828] text-white shadow-md'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold"
                  style={{
                    backgroundColor: isActive ? '#FFDA2D' : '#e2e8f0',
                    color: '#101828',
                  }}
                >
                  {stage.id}
                </span>
                <span>{stage.id === 1 ? 'Static Page' : stage.id === 2 ? 'Aura' : 'Ecosystem'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Step Stage Display Box */}
      <div className="mt-10 relative min-h-[440px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {activeStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-3xl rounded-3xl border border-slate-300 bg-slate-50 p-8 shadow-sm text-center"
            >
              <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
                {STAGES[0].subtitle}
              </p>

              {/* Static Website Mockup */}
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm grayscale opacity-75 max-w-2xl mx-auto">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
                  <div className="h-3 w-3 rounded-full bg-slate-300" />
                  <div className="h-3 w-3 rounded-full bg-slate-300" />
                  <div className="h-3 w-3 rounded-full bg-slate-300" />
                  <div className="ml-4 flex-1 rounded-md bg-slate-100 px-3 py-1 text-left text-xs font-mono text-slate-500">
                    yourwebsite.com
                  </div>
                </div>
                <div className="py-10 text-center">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Static Web Page
                  </div>
                  <div className="flex justify-center gap-6 text-xs text-slate-400 font-mono">
                    <span>About</span>
                    <span>Work</span>
                    <span>Links</span>
                  </div>
                </div>
                <div className="mt-4 text-center text-xs font-semibold text-slate-500 italic bg-slate-100 py-2.5 px-4 rounded-xl">
                  “Too many meaningful connections end before they ever begin.”
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline"
              >
                <span>See next stage: Aura Awakening</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}

          {activeStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-3xl rounded-3xl border border-blue-200 bg-white p-8 shadow-xl text-center relative overflow-hidden"
            >
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-2">
                02 / {STAGES[1].badge}
              </div>
              <h3 className="text-2xl sm:text-4xl font-bold text-[#101828]">
                {STAGES[1].title}
              </h3>
              <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-lg mx-auto">
                {STAGES[1].subtitle}
              </p>

              {/* Aura Awakening Transformation Diagram */}
              <div className="mt-8 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-cyan-50/60 p-6 shadow-md max-w-2xl mx-auto">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex flex-col gap-2 text-left w-full md:w-40">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Static Inputs</div>
                    <div className="rounded-xl bg-white p-2.5 text-xs font-medium text-slate-700 border border-slate-200">
                      Website / Store
                    </div>
                    <div className="rounded-xl bg-white p-2.5 text-xs font-medium text-slate-700 border border-slate-200">
                      Social / Portfolio
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#101828] text-white shadow-lg">
                    <div className="h-12 w-12 rounded-xl bg-white/10 p-1.5 flex items-center justify-center border border-white/20 shadow-sm mb-1">
                      <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-8 w-auto object-contain" />
                    </div>
                    <div className="text-xs font-bold tracking-wide">YULLO AURA</div>
                    <div className="text-[10px] text-slate-300 font-mono mt-0.5">yullo.co/northstarstudio</div>
                  </div>

                  <div className="flex flex-col gap-2 text-left w-full md:w-40">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Aura Outputs</div>
                    <div className="rounded-xl bg-blue-100/80 p-2.5 text-xs font-semibold text-blue-900 border border-blue-200">
                      Services & Portfolio
                    </div>
                    <div className="rounded-xl bg-cyan-100/80 p-2.5 text-xs font-semibold text-cyan-900 border border-cyan-200">
                      Live Customer Answers
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline"
              >
                <span>See next stage: Connected Ecosystem</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}

          {activeStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-3xl rounded-3xl border border-slate-900 bg-[#101828] p-8 shadow-2xl text-left text-white relative overflow-hidden"
            >
              <div className="text-center">
                <div className="inline-block text-xs font-semibold uppercase tracking-widest text-[#FFDA2D] bg-slate-800 px-3 py-1 rounded-full mb-2">
                  03 / {STAGES[2].badge}
                </div>
                <h3 className="text-2xl sm:text-4xl font-bold text-white">
                  {STAGES[2].title}
                </h3>
                <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-lg mx-auto">
                  {STAGES[2].subtitle}
                </p>
              </div>

              {/* Connected Ecosystem Card */}
              <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-inner">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/10 p-1.5 flex items-center justify-center border border-white/20">
                      <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-7 w-auto object-contain" />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#4CD8FF] font-semibold uppercase tracking-wider">Connected Yullo Endpoint</div>
                      <div className="text-sm font-bold text-white font-mono">yullo.co/northstarstudio</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800">
                    <Check className="h-3.5 w-3.5" />
                    <span>Alive & Connected</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-300">
                  <div>Website ──●── Aura ──●── Active Visitor</div>
                  <a href="#claim" className="inline-flex items-center gap-1.5 font-bold text-[#FFDA2D] hover:underline">
                    <span>Claim your address</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
