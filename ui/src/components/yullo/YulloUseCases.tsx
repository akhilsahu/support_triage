import { useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, ArrowRight, Sparkles } from 'lucide-react'
import { yulloConfig } from '../../config/yullo'

const SITUATIONS = [
  {
    id: 'customer',
    title: 'A customer arrives',
    subtitle: 'Visitor looking for work or services',
    query: '“Can you help us launch our new brand?”',
    auraAction: 'Aura presents Northstar Studio’s Startup Brand Architecture package ($6,500, 3-week sprint) and displays 3 recent product identity case studies.',
    nextStep: 'Schedule 20-min strategy alignment session',
    color: '#FFDA2D',
  },
  {
    id: 'work',
    title: 'Someone discovers your work',
    subtitle: 'Visitor exploring your portfolio or ideas',
    query: '“Which of your projects are most like what we’re building?”',
    auraAction: 'Aura filters portfolio to highlight 2 AI-native web apps and live interactive UI components built for similar early-stage startups.',
    nextStep: 'Explore full case study breakdown & tech stack',
    color: '#4CD8FF',
  },
  {
    id: 'opportunity',
    title: 'An opportunity finds you',
    subtitle: 'High-value inquiry or partnership',
    query: '“We’re looking for someone with exactly this experience for an upcoming sprint.”',
    auraAction: 'Aura verifies live availability for next month, shares engagement terms, and captures preliminary project scope notes.',
    nextStep: 'Send custom proposal & calendar invite',
    color: '#6695FF',
  },
]

export function YulloUseCases() {
  const [activeTab, setActiveTab] = useState('customer')
  const current = SITUATIONS.find(s => s.id === activeTab) || SITUATIONS[0]

  return (
    <section id="businesses" className="py-24 px-6 relative z-20 max-w-6xl mx-auto border-t border-slate-200/80">
      <div className="grid lg:grid-cols-12 gap-10 items-center">
        {/* Left Column: Headline & Situation Tabs */}
        <div className="lg:col-span-5 text-left">
          <h2 className={`text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight leading-tight ${yulloConfig.typography.headingClass}`}>
            See what happens when someone finds you.
          </h2>
          <p className="mt-4 text-lg sm:text-xl text-slate-700 leading-relaxed font-normal">
            Whatever someone asks your Yullo Link, your Aura understands why they came and guides them toward what matters.
          </p>

          {/* 3 Situation Tabs */}
          <div className="mt-8 flex flex-col gap-3">
            {SITUATIONS.map(s => {
              const isActive = activeTab === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveTab(s.id)}
                  className={`p-4 rounded-2xl border text-left transition-all duration-200 ${
                    isActive
                      ? 'bg-[#101828] text-white border-slate-900 shadow-md scale-[1.01]'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{s.title}</span>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  </div>
                  <div className={`text-xs mt-1 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                    {s.subtitle}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Column: Dynamic Interactive Showcase Card */}
        <div className="lg:col-span-7">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-3xl border border-slate-200/90 bg-white p-8 shadow-xl text-left flex flex-col justify-between min-h-[360px]"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Situation: {current.title}</span>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-700">yullo.co/northstarstudio</span>
              </div>

              {/* Visitor Question */}
              <div className="mt-6">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Visitor Prompt
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-200/80 text-sm font-semibold text-[#101828]">
                  <MessageSquare className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>{current.query}</span>
                </div>
              </div>

              {/* Aura Action Response */}
              <div className="mt-6">
                <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span>Aura Response & Guidance</span>
                </div>
                <div className="rounded-2xl bg-gradient-to-r from-blue-50/70 to-cyan-50/70 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed">
                  {current.auraAction}
                </div>
              </div>
            </div>

            {/* Next Step */}
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#101828]">
              <span>Next Step: <span className="text-blue-600">{current.nextStep}</span></span>
              <ArrowRight className="h-4 w-4 text-blue-600" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
