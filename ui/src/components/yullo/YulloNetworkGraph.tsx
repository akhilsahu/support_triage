import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Globe } from 'lucide-react'

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
    <section id="network" className="py-28 px-6 relative z-20 max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/60 px-4 py-1 text-xs font-semibold tracking-wider text-blue-800 uppercase mb-3">
          <Sparkles className="h-3.5 w-3.5 text-[#FFDA2D]" />
          <span>06 / CONNECTED PLACES</span>
        </div>
        <h2 className="text-4xl sm:text-6xl font-extrabold text-[#101828] tracking-tight leading-tight">
          One space can<br />
          open another.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Your Yullo Link doesn't have to exist in isolation. As the network grows, people move naturally between relevant ideas, businesses, people and opportunities — based on what they're actually looking for.
        </p>

        <div className="mt-6 inline-block rounded-2xl bg-slate-900 px-6 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 shadow-md">
          Not an endless feed. Not another directory. <span className="text-[#FFDA2D]">A network with somewhere to go.</span>
        </div>
      </div>

      {/* Living Interactive Network Graphic Container */}
      <div className="max-w-4xl mx-auto rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-[#F9FBFF] to-slate-50/80 p-8 sm:p-12 shadow-xl relative overflow-hidden text-left">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center justify-between">
          <span>Interactive Ecosystem Flow</span>
          <span className="text-blue-600 font-mono text-[11px] animate-pulse">Click any node to route connection →</span>
        </div>

        {/* Node Connection Web Display */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {ECOSYSTEM_NODES.map(node => {
            const isActive = activeNodeId === node.id
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setActiveNodeId(node.id)}
                className={`p-4 rounded-2xl border text-left transition-all duration-300 relative ${
                  isActive
                    ? 'bg-[#101828] text-white border-slate-900 shadow-lg scale-[1.03]'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: node.color }}
                  />
                  {isActive && <Globe className="h-3.5 w-3.5 text-[#FFDA2D]" />}
                </div>
                <div className="text-sm font-bold">{node.label}</div>
                <div className={`text-[10px] font-mono mt-0.5 ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                  {node.sub}
                </div>
              </button>
            )
          })}
        </div>

        {/* Active Route Pulse Banner */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-ping shrink-0" />
            <div>
              <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
                Live Network Connection Path
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                “{activeNode.connectionText}”
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-mono font-bold text-slate-800 border border-blue-200/80 shadow-sm">
            {activeNode.label} ➔ {ECOSYSTEM_NODES.find(n => n.id === activeNode.target)?.label}
          </div>
        </div>
      </div>
    </section>
  )
}
