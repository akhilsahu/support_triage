import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Check, ArrowUpRight } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

const NODES = [
  { id: 'work', label: 'Work & Portfolio', color: '#4CD8FF' },
  { id: 'products', label: 'Products & Services', color: '#6695FF' },
  { id: 'ideas', label: 'Ideas & Writings', color: '#A98CFF' },
  { id: 'people', label: 'People & Team', color: '#FFDA2D' },
  { id: 'links', label: 'Curated Links', color: '#4CD8FF' },
  { id: 'knowledge', label: 'Knowledge Base', color: '#6695FF' },
  { id: 'opportunities', label: 'Open Opportunities', color: '#A98CFF' },
]

export function YulloAuraInteractive() {
  const [activeNode, setActiveNode] = useState<string | null>(null)

  return (
    <section id="aura" className="py-24 px-6 relative z-20 max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/60 px-4 py-1 text-xs font-semibold tracking-wider text-blue-800 uppercase mb-3">
          <Sparkles className="h-3.5 w-3.5 text-[#FFDA2D]" />
          <span>PRESENCE OVER PAGES</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight">
          Give your space an Aura.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
          Aura turns your Yullo Link into a space that feels present. It learns your world and helps each visitor find what matters to them — without making them dig for it.
        </p>

        <div className="mt-6 inline-block rounded-2xl bg-amber-50 border border-amber-200/80 px-6 py-2.5 text-sm font-bold text-amber-900 shadow-sm">
          “A webpage waits. An Aura welcomes.”
        </div>
      </div>

      {/* Interactive Aura Node Canvas Card */}
      <div className="relative rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white to-[#F9FBFF] p-8 sm:p-12 shadow-xl max-w-4xl mx-auto overflow-hidden">
        {/* Top Header Tag */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-8 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-slate-900 p-1.5 flex items-center justify-center shadow-sm">
              <img src={yulloConfig.assets.logo} alt="Yullo Logo" className="h-7 w-auto object-contain" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Yullo Link Address</div>
              <div className="text-base font-bold text-[#101828] font-mono">yullo.co/northstarstudio</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span>Aura Active & Present</span>
          </div>
        </div>

        {/* Central Aura Interaction Area */}
        <div className="py-12 flex flex-col md:flex-row items-center justify-between gap-10">
          {/* Node Category Selector */}
          <div className="flex flex-col gap-2.5 w-full md:w-64">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Connected Domains (Hover to illuminate)
            </div>
            {NODES.map(node => {
              const isSelected = activeNode === node.id
              return (
                <button
                  key={node.id}
                  type="button"
                  onMouseEnter={() => setActiveNode(node.id)}
                  onMouseLeave={() => setActiveNode(null)}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200 text-left ${
                    isSelected
                      ? 'bg-[#101828] text-white shadow-md scale-[1.02]'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full transition-transform"
                      style={{ backgroundColor: node.color }}
                    />
                    <span>{node.label}</span>
                  </div>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isSelected ? 'text-[#FFDA2D]' : 'text-slate-400'}`} />
                </button>
              )
            })}
          </div>

          {/* Interactive Response Terminal */}
          <div className="flex-1 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm relative min-h-[280px] flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Visitor Arrives at Northstar Studio
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-800 border border-slate-200/60 mb-6">
                “We’re launching our first product. Can you help us build the brand?”
              </div>

              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span>Aura Guidance</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed font-normal">
                {activeNode === 'work'
                  ? 'Guiding visitor to: Brand Strategy & Identity case studies for product launches.'
                  : activeNode === 'products'
                  ? 'Guiding visitor to: Full Brand Architecture Sprint ($6,500, 3-week delivery).'
                  : activeNode === 'opportunities'
                  ? 'Guiding visitor to: Schedule 20-min strategy alignment session.'
                  : 'Welcome! We specialize in crafting foundational brand identities and launch assets for new products. Let me guide you to our recent brand systems and available kickoff dates.'}
              </p>
            </div>

            {/* Bottom Illuminated Node Badge */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Aura State: {activeNode ? `Guiding to [${activeNode}]` : 'Welcoming & Listening'}</span>
              <span className="text-slate-800 font-semibold">yullo.co/northstarstudio</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
