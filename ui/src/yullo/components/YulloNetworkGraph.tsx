import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { yulloConfig } from '../config'

const ECOSYSTEM_NODES = [
  {
    id: 'emily',
    label: 'Emily Startup',
    sub: 'yullo.co/emilystartup',
    color: '#FFFC00',
    connectionText: 'Connecting them around a shared brand identity project.',
    target: 'northstar',
    x: 120,
    y: 80,
    labelPos: 'right', // label to the right of dot
  },
  {
    id: 'northstar',
    label: 'Northstar Studio',
    sub: 'yullo.co/northstarstudio',
    color: '#4CD8FF',
    connectionText: 'Collaborating on high-impact launch photography & web direction.',
    target: 'visual',
    x: 360,
    y: 130,
    labelPos: 'top', // label above dot
  },
  {
    id: 'visual',
    label: 'Visual Creator',
    sub: 'yullo.co/elena_photo',
    color: '#6695FF',
    connectionText: 'Pairing visual storytelling with interactive UI components.',
    target: 'architect',
    x: 620,
    y: 170,
    labelPos: 'left', // label to the left of dot
  },
  {
    id: 'architect',
    label: 'Systems Architect',
    sub: 'yullo.co/alexdev',
    color: '#A98CFF',
    connectionText: 'Routing live API endpoints & production web architecture.',
    target: 'emily',
    x: 380,
    y: 280,
    labelPos: 'bottom', // label below dot
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
            <line x1="120" y1="80" x2="360" y2="130" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="360" y1="130" x2="620" y2="170" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="620" y1="170" x2="380" y2="280" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="380" y1="280" x2="120" y2="80" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />

            {/* Active Glowing Connection Beam */}
            <motion.line
              x1={activeNode.x}
              y1={activeNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke="#FFFC00"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </svg>

          {/* Interactive Constellation Node Dots with Non-overlapping Labels */}
          {ECOSYSTEM_NODES.map(node => {
            const isActive = activeNodeId === node.id

            let labelPositionClass = 'left-full ml-3 top-1/2 -translate-y-1/2'
            if (node.labelPos === 'left') {
              labelPositionClass = 'right-full mr-3 top-1/2 -translate-y-1/2'
            } else if (node.labelPos === 'top') {
              labelPositionClass = 'bottom-full mb-3 left-1/2 -translate-x-1/2'
            } else if (node.labelPos === 'bottom') {
              labelPositionClass = 'top-full mt-3 left-1/2 -translate-x-1/2'
            }

            return (
              <div
                key={node.id}
                style={{ left: `${(node.x / 760) * 100}%`, top: `${(node.y / 360) * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
              >
                {/* Clickable Dot */}
                <button
                  type="button"
                  onClick={() => setActiveNodeId(node.id)}
                  className="relative flex items-center justify-center transition-transform duration-300 hover:scale-125 cursor-pointer group"
                >
                  <span
                    className={`h-5 w-5 rounded-full border-2 transition-all duration-300 ${
                      isActive ? 'border-[#101828] scale-125 shadow-lg' : 'border-white shadow-sm'
                    }`}
                    style={{ backgroundColor: node.color }}
                  />
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-[#FFFC00] animate-ping opacity-75" />
                  )}
                </button>

                {/* Non-Overlapping Label Box */}
                <div 
                  onClick={() => setActiveNodeId(node.id)}
                  className={`absolute whitespace-nowrap bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/90 shadow-sm transition-all duration-200 cursor-pointer hover:shadow-md ${labelPositionClass}`}
                >
                  <div className="text-sm font-bold text-[#101828] leading-tight flex items-center gap-1.5">
                    <span>{node.label}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">{node.sub}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Dynamic Human Connection Callout Banner */}
        <div className="mt-6 rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFFC00] animate-ping shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Discovery Reason
              </div>
              <div className="text-base font-semibold text-[#101828] mt-0.5">
                “{activeNode.connectionText}”
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-xl bg-[var(--accent-solid)] px-4 py-2 text-xs font-mono font-bold text-[var(--accent-on-solid)] shadow-sm">
            {activeNode.label} ➔ {targetNode.label}
          </div>
        </div>
      </div>
    </section>
  )
}
