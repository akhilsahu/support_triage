import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Globe } from 'lucide-react'
import { yulloConfig } from '../../config/yullo'

const ECOSYSTEM_NODES = [
  {
    id: 'emily',
    label: 'Emily Startup',
    sub: 'yullo.co/emilystartup',
    color: '#FFDA2D',
    connectionText: 'Connecting them around a shared brand identity project.',
    target: 'northstar',
    x: 140,
    y: 70,
  },
  {
    id: 'northstar',
    label: 'Northstar Studio',
    sub: 'yullo.co/northstarstudio',
    color: '#4CD8FF',
    connectionText: 'Collaborating on high-impact launch photography & web direction.',
    target: 'visual',
    x: 360,
    y: 190,
  },
  {
    id: 'visual',
    label: 'Visual Creator',
    sub: 'yullo.co/elena_photo',
    color: '#6695FF',
    connectionText: 'Pairing visual storytelling with interactive UI components.',
    target: 'architect',
    x: 620,
    y: 190,
  },
  {
    id: 'architect',
    label: 'Systems Architect',
    sub: 'yullo.co/alexdev',
    color: '#A98CFF',
    connectionText: 'Routing live API endpoints & production web architecture.',
    target: 'emily',
    x: 460,
    y: 310,
  },
]

export function YulloNetworkGraph() {
  const [activeNodeId, setActiveNodeId] = useState<string>('emily')

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveNodeId(prev => {
        const idx = ECOSYSTEM_NODES.findIndex(n => n.id === prev)
        const nextIdx = (idx + 1) % ECOSYSTEM_NODES.length
        return ECOSYSTEM_NODES[nextIdx].id
      })
    }, 3600)

    return () => clearInterval(timer)
  }, [])

  const activeNode = ECOSYSTEM_NODES.find(n => n.id === activeNodeId) || ECOSYSTEM_NODES[0]
  const targetNode = ECOSYSTEM_NODES.find(n => n.id === activeNode.target) || ECOSYSTEM_NODES[1]

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

      {/* Pure 2D Constellation Topology Visual */}
      <div className="max-w-4xl mx-auto relative text-left">
        <div className="relative w-full h-[360px] bg-white/40 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-6 shadow-sm overflow-hidden">
          {/* SVG Connection Paths */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 760 360" fill="none">
            {/* Background Structural Lines */}
            <line x1="140" y1="70" x2="360" y2="190" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="360" y1="190" x2="620" y2="190" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="360" y1="190" x2="460" y2="310" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="460" y1="310" x2="140" y2="70" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />

            {/* Active Glowing Connection Beam */}
            <motion.line
              x1={activeNode.x}
              y1={activeNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke="#FFDA2D"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </svg>

          {/* Interactive Constellation Node Dots with Names Beside Them */}
          {ECOSYSTEM_NODES.map(node => {
            const isActive = activeNodeId === node.id
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setActiveNodeId(node.id)}
                style={{ left: `${(node.x / 760) * 100}%`, top: `${(node.y / 360) * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group flex items-center gap-3 transition-transform duration-300 hover:scale-110 z-10"
              >
                {/* Node Dot */}
                <div className="relative flex items-center justify-center">
                  <span
                    className={`h-5 w-5 rounded-full border-2 transition-all duration-300 ${
                      isActive ? 'border-[#101828] scale-125 shadow-lg' : 'border-white shadow-sm'
                    }`}
                    style={{ backgroundColor: node.color }}
                  />
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-[#FFDA2D] animate-ping opacity-75" />
                  )}
                </div>

                {/* Name & Link Beside Dot */}
                <div className="text-left bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/90 shadow-sm transition-all duration-200 group-hover:shadow-md">
                  <div className="text-sm font-bold text-[#101828] leading-tight flex items-center gap-1.5">
                    <span>{node.label}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">{node.sub}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Dynamic Human Connection Callout Banner */}
        <div className="mt-6 rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFDA2D] animate-ping shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Discovery Reason
              </div>
              <div className="text-base font-semibold text-[#101828] mt-0.5">
                “{activeNode.connectionText}”
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-mono font-bold text-white shadow-sm">
            {activeNode.label} ➔ {targetNode.label}
          </div>
        </div>
      </div>
    </section>
  )
}
