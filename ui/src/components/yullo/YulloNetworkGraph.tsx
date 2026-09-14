import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Globe } from 'lucide-react'
import { yulloConfig } from '../../config/yullo'

const ECOSYSTEM_NODES = [
  {
    id: 'startup',
    label: 'Early Startup',
    sub: 'yullo.co/hyperion',
    color: '#FFDA2D',
    connectionText: 'Looking for someone to shape their first product identity.',
    target: 'designer',
  },
  {
    id: 'designer',
    label: 'Northstar Studio',
    sub: 'yullo.co/northstarstudio',
    color: '#4CD8FF',
    connectionText: 'Connecting startup with specialized brand identity system.',
    target: 'photographer',
  },
  {
    id: 'photographer',
    label: 'Visual Creator',
    sub: 'yullo.co/elena_photo',
    color: '#6695FF',
    connectionText: 'Collaborating on high-impact launch photography.',
    target: 'developer',
  },
  {
    id: 'developer',
    label: 'Systems Architect',
    sub: 'yullo.co/alexdev',
    color: '#A98CFF',
    connectionText: 'Integrating live API endpoints & interactive components.',
    target: 'startup',
  },
]

export function YulloNetworkGraph() {
  const [activeNodeId, setActiveNodeId] = useState<string>('startup')

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveNodeId(prev => {
        const idx = ECOSYSTEM_NODES.findIndex(n => n.id === prev)
        const nextIdx = (idx + 1) % ECOSYSTEM_NODES.length
        return ECOSYSTEM_NODES[nextIdx].id
      })
    }, 3200)

    return () => clearInterval(timer)
  }, [])

  const activeNode = ECOSYSTEM_NODES.find(n => n.id === activeNodeId) || ECOSYSTEM_NODES[0]

  return (
    <section id="network" className="py-16 px-6 relative z-20 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h2 className={`text-4xl sm:text-6xl font-extrabold text-[#101828] tracking-tight leading-tight ${yulloConfig.typography.headingClass}`}>
          One space can<br />
          open another.
        </h2>
        <p className="mt-4 text-lg sm:text-xl text-slate-800 max-w-2xl mx-auto leading-relaxed font-normal">
          Your Yullo Link doesn't have to exist in isolation. As the network grows, people move naturally between relevant ideas, businesses, people and opportunities — based on what they're actually looking for.
        </p>
      </div>

      {/* Living Unboxed Network Visualization */}
      <div className="max-w-4xl mx-auto relative text-left">
        {/* Floating Node Connection Matrix (Unboxed) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-6">
          {ECOSYSTEM_NODES.map(node => {
            const isActive = activeNodeId === node.id
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setActiveNodeId(node.id)}
                className={`p-5 rounded-2xl border text-left transition-all duration-300 relative ${
                  isActive
                    ? 'bg-[#101828] text-white border-slate-900 shadow-xl scale-[1.04] z-10'
                    : 'bg-white/80 backdrop-blur-sm text-slate-700 hover:bg-white border-slate-200/90 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="h-3 w-3 rounded-full shadow-sm"
                    style={{ backgroundColor: node.color }}
                  />
                  {isActive && <Globe className="h-4 w-4 text-[#FFDA2D]" />}
                </div>
                <div className="text-base font-bold">{node.label}</div>
                <div className={`text-xs font-mono mt-1 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                  {node.sub}
                </div>
              </button>
            )
          })}
        </div>

        {/* Dynamic Route Connection Bar */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFDA2D] animate-ping shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Live Ecosystem Path
              </div>
              <div className="text-base font-semibold text-[#101828] mt-0.5">
                “{activeNode.connectionText}”
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-mono font-bold text-white shadow-sm">
            {activeNode.label} ➔ {ECOSYSTEM_NODES.find(n => n.id === activeNode.target)?.label}
          </div>
        </div>
      </div>
    </section>
  )
}
