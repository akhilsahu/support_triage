import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Globe } from 'lucide-react'

const NETWORK_NODES = [
  { id: 'designer', title: 'Product Designer', loc: 'San Francisco · UI/UX · Systems', color: '#4CD8FF' },
  { id: 'engineer', title: 'AI Engineer', loc: 'London · LLMs · RAG Architect', color: '#6695FF' },
  { id: 'studio', title: 'Northstar Studio', loc: 'New York · Brand & SaaS Development', color: '#FFDA2D' },
  { id: 'creator', title: 'Travel Creator', loc: 'Kyoto · Photography · Partnerships', color: '#A98CFF' },
  { id: 'community', title: 'Vision Community', loc: 'Global · Computer Vision & Robotics', color: '#4CD8FF' },
]

export function YulloNetworkGraph() {
  const [hoveredNode, setHoveredNode] = useState<string>('studio')

  const current = NETWORK_NODES.find(n => n.id === hoveredNode) || NETWORK_NODES[2]

  return (
    <section id="network" className="py-24 px-6 relative z-20 max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/60 px-4 py-1 text-xs font-semibold tracking-wider text-blue-800 uppercase mb-3">
          <Sparkles className="h-3.5 w-3.5 text-[#FFDA2D]" />
          <span>CONNECTED PLACES</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight">
          One space can open another.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Your Yullo Link doesn't have to exist in isolation. As the network grows, people can move naturally between relevant ideas, businesses, people and opportunities — based on what they're actually looking for.
        </p>

        <div className="mt-6 inline-block rounded-2xl bg-slate-900 px-6 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 shadow-md">
          Not an endless feed. Not another directory. <span className="text-[#FFDA2D]">A network with somewhere to go.</span>
        </div>
      </div>

      {/* Network Nodes Grid */}
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {NETWORK_NODES.map(node => {
          const isHovered = hoveredNode === node.id
          return (
            <motion.div
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              whileHover={{ y: -4 }}
              className={`cursor-pointer rounded-2xl border p-6 transition-all duration-200 text-left ${
                isHovered
                  ? 'border-blue-300 bg-white shadow-xl ring-2 ring-blue-400/20'
                  : 'border-slate-200 bg-white/70 hover:bg-white shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: node.color }}
                />
                <Globe className="h-4 w-4 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-[#101828]">{node.title}</h3>
              <p className="mt-1 text-xs text-slate-500 font-mono">{node.loc}</p>
            </motion.div>
          )
        })}

        {/* Dynamic Highlight Card */}
        <div className="rounded-2xl border border-slate-900 bg-[#101828] p-6 text-white text-left flex flex-col justify-between md:col-span-1">
          <div>
            <div className="text-xs font-semibold text-[#4CD8FF] uppercase tracking-wider mb-2">
              Active Network Node
            </div>
            <div className="text-lg font-bold text-white">{current.title}</div>
            <div className="text-xs text-slate-300 font-mono mt-1">{current.loc}</div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Aura Connected</span>
            <span className="text-[#FFDA2D] font-bold">Live →</span>
          </div>
        </div>
      </div>
    </section>
  )
}
